// Mysten measured benchmarks (pq-bench, sui-pq repo). 
export const MYSTEN_BENCH_HEADER =
	'name,family,security_level,std,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519';

// The baseline row every per-host ratio is computed against. Ratios are only ever
// intra-host: a Mac verify time is never divided by a server Ed25519 time.
export const ED25519_ROW_NAME = 'Ed25519';

export interface MystenBenchRow {
	name: string;
	family: string;
	securityLevel: string;
	std: string;
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
			`Unexpected pq-bench CSV header:\n  got:      ${lines[0].trim()}\n  expected: ${MYSTEN_BENCH_HEADER}`
		);
	}

	return lines.slice(1).map((line) => {
		const f = line.split(',').map((v) => v.trim());
		return {
			name: f[0] ?? '',
			family: f[1] ?? '',
			securityLevel: f[2] ?? '',
			std: f[3] ?? '',
			pkLen: num(f[4]) ?? 0,
			sigLen: num(f[5]) ?? 0,
			skLen: num(f[6]),
			keygenNs: num(f[7]),
			signNs: num(f[8]),
			verifyNs: num(f[9]),
			verifyCyc: num(f[10]),
			verifyIters: num(f[11]),
			vsEd25519: num(f[12]),
		};
	});
}


export function computeVerifyRatios(rows: MystenBenchRow[]): Map<string, number> {
	const baseline = rows.find((r) => r.name === ED25519_ROW_NAME)?.verifyNs;
	if (baseline == null || baseline <= 0) return new Map();

	const ratios = new Map<string, number>();
	for (const r of rows) {
		if (r.verifyNs != null) ratios.set(r.name, r.verifyNs / baseline);
	}
	return ratios;
}
