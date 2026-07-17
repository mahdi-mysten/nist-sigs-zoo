// Mysten measured benchmarks (pq-sig-bench harness, measured through fastcrypto —
// the same stack a Sui validator runs). One CSV row per (scheme, implementation).
export const MYSTEN_BENCH_HEADER =
	'scheme,impl,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519';

// Impl label marking rows carried over from the previous harness run. Their
// vs_ed25519 ratios were computed against that run's own Ed25519 baseline and
// must never be recomputed against the current run's baseline.
export const OLDER_RUN_IMPL = 'earlier pq-bench run';

export interface MystenBenchRow {
	scheme: string;
	impl: string;
	pkLen: number;
	sigLen: number;
	skLen: number | null;
	keygenNs: number | null;
	signNs: number | null;
	verifyNs: number | null;
	verifyCyc: number | null;
	verifyIters: number | null;
	vsEd25519: number | null;
}

// One row per scheme with timing fields averaged over the implementations that
// report them. `impls` keeps the raw per-implementation rows so the UI can show
// the spread (tooltips) or special-case a reference implementation.
export interface MystenSchemeAgg {
	scheme: string;
	pkLen: number;
	sigLen: number;
	keygenNs: number | null;
	signNs: number | null;
	verifyNs: number | null;
	vsEd25519: number | null;
	impls: MystenBenchRow[];
}

function num(s: string | undefined): number | null {
	if (s == null || s.trim() === '') return null;
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
}

export function parseMystenBenchCsv(text: string): MystenBenchRow[] {
	const lines = text
		.split('\n')
		.map((l) => l.replace(/\r$/, ''))
		.filter((l) => l.trim() !== '' && !l.trimStart().startsWith('#'));

	if (lines.length === 0) return [];
	if (lines[0].trim() !== MYSTEN_BENCH_HEADER) {
		throw new Error(
			`Unexpected pq-sig-bench CSV header:\n  got:      ${lines[0].trim()}\n  expected: ${MYSTEN_BENCH_HEADER}`
		);
	}

	return lines.slice(1).map((line) => {
		const f = line.split(',').map((v) => v.trim());
		return {
			scheme: f[0] ?? '',
			impl: f[1] ?? '',
			pkLen: num(f[2]) ?? 0,
			sigLen: num(f[3]) ?? 0,
			skLen: num(f[4]),
			keygenNs: num(f[5]),
			signNs: num(f[6]),
			verifyNs: num(f[7]),
			verifyCyc: num(f[8]),
			verifyIters: num(f[9]),
			vsEd25519: num(f[10]),
		};
	});
}

function mean(vals: (number | null)[]): number | null {
	const xs = vals.filter((v): v is number => v != null);
	if (xs.length === 0) return null;
	return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Collapses per-implementation rows into one row per scheme (first-seen order).
// Sizes are implementation-independent, so the first row's pk/sig are taken as
// canonical; timings and the vs-Ed25519 ratio are means over the impls that
// report them, which keeps a verify-only row from zeroing the sign column.
export function aggregateByScheme(rows: MystenBenchRow[]): MystenSchemeAgg[] {
	const order: string[] = [];
	const groups = new Map<string, MystenBenchRow[]>();
	for (const r of rows) {
		if (!groups.has(r.scheme)) {
			groups.set(r.scheme, []);
			order.push(r.scheme);
		}
		groups.get(r.scheme)!.push(r);
	}
	return order.map((scheme) => {
		const impls = groups.get(scheme)!;
		return {
			scheme,
			pkLen: impls[0].pkLen,
			sigLen: impls[0].sigLen,
			keygenNs: mean(impls.map((r) => r.keygenNs)),
			signNs: mean(impls.map((r) => r.signNs)),
			verifyNs: mean(impls.map((r) => r.verifyNs)),
			vsEd25519: mean(impls.map((r) => r.vsEd25519)),
			impls,
		};
	});
}
