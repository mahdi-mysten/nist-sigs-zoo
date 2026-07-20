// Keygen/sign benchmarks for the Sui lens's Keygen/Sign (TS) columns —
// TypeScript/JS runtime cost, as opposed to the Rust/fastcrypto verify numbers
// in data/mysten/mac-m2-max.csv. Signing happens client-side in wallets
// (browser extensions, mobile apps), which are typically JS/TS, not Rust — this
// measures that stack instead, using the libraries a Sui wallet would actually
// reach for: @mysten/sui for Ed25519, @noble/post-quantum for the PQ schemes.
//
// Method mirrors pq-sig-bench (see data/mysten/mac-m2-max.csv's own header
// comment): warmup 2, then N timed iterations with a fresh random key (keygen)
// or a fresh random message under one fixed key (sign) every iteration — ML-DSA
// and Falcon both use rejection sampling, so a fixed input would understate
// their real variance. N is 1000 for schemes cheap enough to finish quickly and
// 100 for the ones that aren't (SLH-DSA's hash-heavy signing, Falcon's
// rejection-sampled keygen/signing) — the exact N used is recorded per row in
// keygen_iters/sign_iters rather than assumed.
//
// Requires Node >=22.6 (runs this .ts file directly via native TypeScript
// support — no build step, no ts-node/tsx dependency).
//
// Usage: node scripts/ts-bench.ts [--iters-fast=1000] [--iters-slow=100]
// Writes: data/mysten/ts-bench.csv

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { falcon1024padded, falcon512padded } from '@noble/post-quantum/falcon.js';
import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import {
	slh_dsa_sha2_128f,
	slh_dsa_sha2_128s,
	slh_dsa_shake_128f,
	slh_dsa_shake_128s,
} from '@noble/post-quantum/slh-dsa.js';

const WARMUP = 2;

function argNum(flag: string, fallback: number): number {
	const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
	return arg ? Number(arg.split('=')[1]) : fallback;
}
const ITERS_FAST = argNum('iters-fast', 1000);
const ITERS_SLOW = argNum('iters-slow', 100);
// SLH-DSA-SHAKE-128s's sign is ~7.5s/op in JS (vs ~1s in Rust — pure-JS SHAKE
// hashing has no hardware acceleration) — at ITERS_SLOW=100 that's ~12.5
// minutes for one scheme alone. SLH-DSA-SHA2-128s is faster (~2.2s/op, SHA-2
// being cheaper than SHAKE in pure JS) but still slow enough that 100 would
// push the full script's runtime uncomfortably long. Cap both specifically so
// the full script still finishes in one reasonable run; every other "slow"
// scheme keeps 100. A cap (via Math.min), not a fixed override, so passing a
// smaller --iters-slow for a quick dry run still shrinks these too.
const SLOW_ITER_CAPS: Record<string, number> = {
	'SLH-DSA-SHAKE-128s': 30,
	'SLH-DSA-SHA2-128s': 50,
};
function slowIters(scheme: string): number {
	return Math.min(ITERS_SLOW, SLOW_ITER_CAPS[scheme] ?? Infinity);
}

interface BenchResult {
	nsMedian: number;
	iters: number;
}

function median(samples: number[]): number {
	const sorted = [...samples].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

function randomMessage(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(32));
}

async function benchAsync(
	fn: () => Promise<unknown>,
	warmup: number,
	iters: number
): Promise<BenchResult> {
	for (let i = 0; i < warmup; i++) await fn();
	const samples: number[] = [];
	for (let i = 0; i < iters; i++) {
		const t0 = process.hrtime.bigint();
		await fn();
		samples.push(Number(process.hrtime.bigint() - t0));
	}
	return { nsMedian: median(samples), iters };
}

function benchSync(fn: () => unknown, warmup: number, iters: number): BenchResult {
	for (let i = 0; i < warmup; i++) fn();
	const samples: number[] = [];
	for (let i = 0; i < iters; i++) {
		const t0 = process.hrtime.bigint();
		fn();
		samples.push(Number(process.hrtime.bigint() - t0));
	}
	return { nsMedian: median(samples), iters };
}

interface PqScheme {
	keygen(seed?: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array };
	sign(msg: Uint8Array, secretKey: Uint8Array): Uint8Array;
}

interface Row {
	scheme: string;
	lib: string;
	keygen: BenchResult;
	sign: BenchResult;
}

const rows: Row[] = [];

// pk/sig byte lengths already established in data/mysten/mac-m2-max.csv (from
// pq-sig-bench/fastcrypto). A mismatch here means the wrong parameter set or
// wire variant is wired up — e.g. non-padded Falcon instead of padded — and
// the timing that follows shouldn't be trusted. Mirrors the self-check every
// row gets in pq-sig-bench before its timing is reported.
const EXPECTED_SIZES: Record<string, { pk: number; sig: number }> = {
	Ed25519: { pk: 32, sig: 64 },
	'FN-DSA-512': { pk: 897, sig: 666 },
	'FN-DSA-1024': { pk: 1793, sig: 1280 },
	'ML-DSA-44': { pk: 1312, sig: 2420 },
	'ML-DSA-65': { pk: 1952, sig: 3309 },
	'ML-DSA-87': { pk: 2592, sig: 4627 },
	'SLH-DSA-SHAKE-128s': { pk: 32, sig: 7856 },
	'SLH-DSA-SHAKE-128f': { pk: 32, sig: 17088 },
	'SLH-DSA-SHA2-128s': { pk: 32, sig: 7856 },
	'SLH-DSA-SHA2-128f': { pk: 32, sig: 17088 },
};

function checkSizes(scheme: string, pk: number, sig: number): void {
	const want = EXPECTED_SIZES[scheme];
	if (want == null) {
		throw new Error(`${scheme}: no EXPECTED_SIZES entry — add one before benching a new scheme`);
	}
	if (want.pk !== pk || want.sig !== sig) {
		throw new Error(
			`${scheme}: expected pk=${want.pk} sig=${want.sig}, got pk=${pk} sig=${sig} — wrong parameter set or wire variant`
		);
	}
}

function benchPqScheme(scheme: string, lib: PqScheme, iters: number): Row {
	console.error(`${scheme} (${iters} iters)...`);
	const { publicKey, secretKey } = lib.keygen();
	checkSizes(scheme, publicKey.length, lib.sign(randomMessage(), secretKey).length);
	const keygen = benchSync(() => lib.keygen(), WARMUP, iters);
	// One untimed keygen to get a key the sign benchmark reuses — a real signer
	// holds one key and signs many messages with it, not a fresh key per call.
	const sign = benchSync(() => lib.sign(randomMessage(), secretKey), WARMUP, iters);
	return { scheme, lib: '@noble/post-quantum', keygen, sign };
}

// --- Ed25519 (Sui TS SDK) — Ed25519Keypair.sign() is async, unlike the PQ
// libraries' sync API; that's a genuine property of each library's real
// surface, not an artifact of this harness, so the timing includes it as-is. ---
{
	console.error(`Ed25519 (${ITERS_FAST} iters)...`);
	const kp = Ed25519Keypair.generate();
	const sig0 = await kp.sign(randomMessage());
	checkSizes('Ed25519', kp.getPublicKey().toRawBytes().length, sig0.length);
	const keygen = await benchAsync(async () => Ed25519Keypair.generate(), WARMUP, ITERS_FAST);
	const sign = await benchAsync(async () => void (await kp.sign(randomMessage())), WARMUP, ITERS_FAST);
	rows.push({ scheme: 'Ed25519', lib: '@mysten/sui', keygen, sign });
}

// --- ML-DSA (noble-post-quantum) ---
for (const [scheme, lib] of [
	['ML-DSA-44', ml_dsa44],
	['ML-DSA-65', ml_dsa65],
	['ML-DSA-87', ml_dsa87],
] as const) {
	rows.push(benchPqScheme(scheme, lib, ITERS_FAST));
}

// --- SLH-DSA (noble-post-quantum) — hash-heavy signing, reduced iterations ---
for (const [scheme, lib] of [
	['SLH-DSA-SHAKE-128s', slh_dsa_shake_128s],
	['SLH-DSA-SHAKE-128f', slh_dsa_shake_128f],
	['SLH-DSA-SHA2-128s', slh_dsa_sha2_128s],
	['SLH-DSA-SHA2-128f', slh_dsa_sha2_128f],
] as const) {
	rows.push(benchPqScheme(scheme, lib, slowIters(scheme)));
}

// --- Falcon (noble-post-quantum) — rejection-sampled keygen/sign, reduced iterations ---
for (const [scheme, lib] of [
	['FN-DSA-512', falcon512padded],
	['FN-DSA-1024', falcon1024padded],
] as const) {
	rows.push(benchPqScheme(scheme, lib, slowIters(scheme)));
}

// --- Ratios vs Ed25519 — computed here, intra-run, exactly like mac-m2-max.csv's
// own vs_ed25519 column (pq-sig-bench computes that one itself; the lens never
// recomputes it). Same rule applied here so both CSVs are "harness owns its
// ratios, UI just displays them." ---
const ed25519 = rows.find((r) => r.scheme === 'Ed25519');
if (ed25519 == null) throw new Error('Ed25519 row missing — cannot compute vs-Ed25519 ratios');
function ratio(ns: number, baseline: number): string {
	return (ns / baseline).toFixed(2);
}

// --- Write CSV ---
const HEADER =
	'scheme,lib,keygen_ns,sign_ns,keygen_iters,sign_iters,keygen_vs_ed25519,sign_vs_ed25519';
const lines = [
	'# TypeScript keygen/sign benchmarks (scripts/ts-bench.ts) — wallet-side cost,',
	'# measured through the libraries a Sui wallet would actually use: @mysten/sui',
	'# for Ed25519, @noble/post-quantum for the PQ schemes. A different axis from',
	'# the Rust/fastcrypto verify numbers in mac-m2-max.csv (validators run Rust;',
	'# wallets typically run JS/TS). Median of N iterations (keygen_iters/',
	'# sign_iters — 1000 where cheap, 100 where not), warmup 2, fresh random',
	'# key/message every iteration. *_vs_ed25519 are intra-run ratios against this',
	"# same file's own Ed25519 row — never recompute them against mac-m2-max.csv's.",
	'# Re-run: node scripts/ts-bench.ts',
	`# Apple M2 Max (macOS, arm64), ${process.version}.`,
	HEADER,
	...rows.map(
		(r) =>
			`${r.scheme},${r.lib},${r.keygen.nsMedian},${r.sign.nsMedian},${r.keygen.iters},${r.sign.iters},` +
			`${ratio(r.keygen.nsMedian, ed25519.keygen.nsMedian)},${ratio(r.sign.nsMedian, ed25519.sign.nsMedian)}`
	),
];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(repoRoot, 'data', 'mysten', 'ts-bench.csv');
writeFileSync(dest, lines.join('\n') + '\n');
console.error(`wrote ${dest} (${rows.length} rows)`);
