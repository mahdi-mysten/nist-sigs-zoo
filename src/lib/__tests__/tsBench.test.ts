import { describe, it, expect } from 'vitest';
import { TS_BENCH_HEADER, parseTsBenchCsv } from '$lib/tsBench';

const SAMPLE = `${TS_BENCH_HEADER}
Ed25519,@mysten/sui,228666,441208,1000,1000,1.00,1.00
ML-DSA-44,@noble/post-quantum,1485417,4977875,1000,1000,6.50,11.28
SLH-DSA-SHAKE-128s,@noble/post-quantum,995034875,7542039708,30,30,4351.31,17098.31
`;

describe('parseTsBenchCsv', () => {
	it('parses rows with numeric fields', () => {
		const rows = parseTsBenchCsv(SAMPLE);
		expect(rows).toHaveLength(3);

		const mldsa = rows[1];
		expect(mldsa.scheme).toBe('ML-DSA-44');
		expect(mldsa.lib).toBe('@noble/post-quantum');
		expect(mldsa.keygenNs).toBe(1485417);
		expect(mldsa.signNs).toBe(4977875);
		expect(mldsa.keygenIters).toBe(1000);
		expect(mldsa.signIters).toBe(1000);
		expect(mldsa.keygenVsEd25519).toBe(6.5);
		expect(mldsa.signVsEd25519).toBe(11.28);
	});

	it('Ed25519 is its own 1.00× baseline', () => {
		const [ed] = parseTsBenchCsv(SAMPLE);
		expect(ed.keygenVsEd25519).toBe(1.0);
		expect(ed.signVsEd25519).toBe(1.0);
	});

	it('preserves a per-scheme reduced iteration count', () => {
		const [, , slh] = parseTsBenchCsv(SAMPLE);
		expect(slh.keygenIters).toBe(30);
		expect(slh.signIters).toBe(30);
		expect(slh.signVsEd25519).toBeCloseTo(17098.31, 5);
	});

	it('skips # comments and blank lines', () => {
		const csv = `# leading comment\n\n${TS_BENCH_HEADER}\n# mid comment\nEd25519,@mysten/sui,1,1,1,1,1.00,1.00\n\n`;
		expect(parseTsBenchCsv(csv)).toHaveLength(1);
	});

	it('header-only placeholder parses to [] — the pending state', () => {
		const placeholder = `# not yet run\n${TS_BENCH_HEADER}\n`;
		expect(parseTsBenchCsv(placeholder)).toEqual([]);
	});

	it('comment-only text parses to []', () => {
		expect(parseTsBenchCsv('# nothing here\n')).toEqual([]);
	});

	it('throws on a header mismatch', () => {
		expect(() => parseTsBenchCsv('scheme,lib,wrong\nfoo,bar,1\n')).toThrow(
			/Unexpected ts-bench CSV header/
		);
	});

	it('rejects the previous (no-ratio-columns) header format', () => {
		const old = 'scheme,lib,keygen_ns,sign_ns,keygen_iters,sign_iters';
		expect(() => parseTsBenchCsv(`${old}\n`)).toThrow(/Unexpected ts-bench CSV header/);
	});

	it('tolerates CRLF line endings', () => {
		const csv = SAMPLE.replaceAll('\n', '\r\n');
		expect(parseTsBenchCsv(csv)).toHaveLength(3);
	});
});
