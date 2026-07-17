// TypeScript keygen/sign benchmark results (scripts/ts-bench.ts) — the Sui
// lens's Keygen/Sign columns, measured through the libraries a Sui wallet
// would actually use (@mysten/sui for Ed25519, @noble/post-quantum for the PQ
// schemes). A different axis from mystenBench.ts's Rust/fastcrypto verify
// numbers: validators run Rust, wallets typically run JS/TS. One row per
// scheme (no impl column — unlike mystenBench.ts, there's exactly one library
// per scheme here, so no averaging concept applies).
export const TS_BENCH_HEADER = 'scheme,lib,keygen_ns,sign_ns,keygen_iters,sign_iters';

export interface TsBenchRow {
	scheme: string;
	lib: string;
	keygenNs: number | null;
	signNs: number | null;
	keygenIters: number | null;
	signIters: number | null;
}

function num(s: string | undefined): number | null {
	if (s == null || s.trim() === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

export function parseTsBenchCsv(text: string): TsBenchRow[] {
	const lines = text
		.split('\n')
		.map((l) => l.replace(/\r$/, ''))
		.filter((l) => l.trim() !== '' && !l.trimStart().startsWith('#'));

	if (lines.length === 0) return [];
	if (lines[0].trim() !== TS_BENCH_HEADER) {
		throw new Error(
			`Unexpected ts-bench CSV header:\n  got:      ${lines[0].trim()}\n  expected: ${TS_BENCH_HEADER}`
		);
	}

	return lines.slice(1).map((line) => {
		const f = line.split(',').map((v) => v.trim());
		return {
			scheme: f[0] ?? '',
			lib: f[1] ?? '',
			keygenNs: num(f[2]),
			signNs: num(f[3]),
			keygenIters: num(f[4]),
			signIters: num(f[5]),
		};
	});
}
