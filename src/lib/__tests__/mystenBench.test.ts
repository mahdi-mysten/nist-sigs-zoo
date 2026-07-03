import { describe, it, expect } from 'vitest';
import {
	MYSTEN_BENCH_HEADER,
	computeVerifyRatios,
	parseMystenBenchCsv,
} from '$lib/mystenBench';

const SAMPLE = `${MYSTEN_BENCH_HEADER}
Ed25519,Pre-quantum (baseline),,pre-quantum,32,64,32,27709,27542,42958,,1000,1.0
Falcon-512 (PQClean C),Lattice / NTRU (Falcon),1,FIPS 206 (draft),897,666,1281,4235167,144959,19500,,1000,0.5
SLH-DSA-SHAKE-128s,Hash-based (SLH-DSA),1,FIPS (final),32,7856,64,126867041,968156208,872333,,1000,20.3
`;

describe('parseMystenBenchCsv', () => {
	it('parses rows with numeric and empty fields', () => {
		const rows = parseMystenBenchCsv(SAMPLE);
		expect(rows).toHaveLength(3);

		const falcon = rows[1];
		expect(falcon.name).toBe('Falcon-512 (PQClean C)');
		expect(falcon.family).toBe('Lattice / NTRU (Falcon)');
		expect(falcon.pkLen).toBe(897);
		expect(falcon.sigLen).toBe(666);
		expect(falcon.verifyNs).toBe(19500);
		expect(falcon.verifyCyc).toBeNull(); // empty column
		expect(falcon.verifyIters).toBe(1000);
	});

	it('empty verify_ns parses to null (Rust rows without a C keygen)', () => {
		const csv = `${MYSTEN_BENCH_HEADER}\nFalcon-512,Lattice,1,FIPS 206 (draft),897,666,,,,41209,,1000,1.0\n`;
		const [row] = parseMystenBenchCsv(csv);
		expect(row.skLen).toBeNull();
		expect(row.keygenNs).toBeNull();
		expect(row.signNs).toBeNull();
		expect(row.verifyNs).toBe(41209);
	});

	it('skips # comments and blank lines', () => {
		const csv = `# leading comment\n\n${MYSTEN_BENCH_HEADER}\n# mid comment\nEd25519,base,,pre-quantum,32,64,32,1,1,100,,1000,1.0\n\n`;
		expect(parseMystenBenchCsv(csv)).toHaveLength(1);
	});

	it('header-only placeholder parses to [] — the pending state', () => {
		const placeholder = `# server run not yet imported\n${MYSTEN_BENCH_HEADER}\n`;
		expect(parseMystenBenchCsv(placeholder)).toEqual([]);
	});

	it('comment-only text parses to []', () => {
		expect(parseMystenBenchCsv('# nothing here\n')).toEqual([]);
	});

	it('throws on a header mismatch', () => {
		expect(() => parseMystenBenchCsv('name,family,wrong\nfoo,bar,1\n')).toThrow(
			/Unexpected pq-bench CSV header/
		);
	});

	it('tolerates CRLF line endings', () => {
		const csv = SAMPLE.replaceAll('\n', '\r\n');
		expect(parseMystenBenchCsv(csv)).toHaveLength(3);
	});
});

describe('computeVerifyRatios', () => {
	it('computes ratios against the same set’s Ed25519 row', () => {
		const ratios = computeVerifyRatios(parseMystenBenchCsv(SAMPLE));
		expect(ratios.get('Ed25519')).toBe(1);
		expect(ratios.get('Falcon-512 (PQClean C)')).toBeCloseTo(19500 / 42958, 5);
		expect(ratios.get('SLH-DSA-SHAKE-128s')).toBeCloseTo(872333 / 42958, 5);
	});

	it('returns an empty map when the Ed25519 baseline is missing', () => {
		const csv = `${MYSTEN_BENCH_HEADER}\nML-DSA-44,Lattice,2,FIPS (final),1312,2420,2560,1,1,51084,,1000,1.2\n`;
		expect(computeVerifyRatios(parseMystenBenchCsv(csv)).size).toBe(0);
	});

	it('returns an empty map for the pending (empty) state', () => {
		expect(computeVerifyRatios([]).size).toBe(0);
	});
});
