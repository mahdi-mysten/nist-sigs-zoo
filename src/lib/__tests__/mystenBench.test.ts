import { describe, it, expect } from 'vitest';
import {
	MYSTEN_BENCH_HEADER,
	OLDER_RUN_IMPL,
	aggregateByScheme,
	parseMystenBenchCsv,
} from '$lib/mystenBench';

const SAMPLE = `${MYSTEN_BENCH_HEADER}
Ed25519,fastcrypto (baseline),32,64,32,10417,11250,27959,,1000,1.00,—
FN-DSA-512,Falcon-512,897,666,,,,13208,,1000,0.47,0.65
FN-DSA-512,Falcon-512 (PQClean C),897,666,1281,4104500,144625,20416,,1000,0.73,1.00
ML-DSA-44,libcrux,1312,2420,2560,36625,106958,35583,,1000,1.27,1.76
ML-DSA-44,aws-lc-rs,1312,2420,32,17917,37000,14416,,1000,0.52,0.71
SLH-DSA-SHAKE-128s,${OLDER_RUN_IMPL},32,7856,64,129455667,991862791,980500,,1000,22.1,
`;

describe('parseMystenBenchCsv', () => {
	it('parses rows with numeric and empty fields', () => {
		const rows = parseMystenBenchCsv(SAMPLE);
		expect(rows).toHaveLength(6);

		const pqclean = rows[2];
		expect(pqclean.scheme).toBe('FN-DSA-512');
		expect(pqclean.impl).toBe('Falcon-512 (PQClean C)');
		expect(pqclean.pkLen).toBe(897);
		expect(pqclean.sigLen).toBe(666);
		expect(pqclean.verifyNs).toBe(20416);
		expect(pqclean.verifyCyc).toBeNull(); // empty column
		expect(pqclean.verifyIters).toBe(1000);
		expect(pqclean.vsEd25519).toBe(0.73);
		expect(pqclean.vsPqclean).toBe(1.0);
	});

	it('non-numeric vs_pqclean ("—" on the baseline row) parses to null', () => {
		const [ed] = parseMystenBenchCsv(SAMPLE);
		expect(ed.vsPqclean).toBeNull();
		expect(ed.vsEd25519).toBe(1.0);
	});

	it('empty keygen/sign parse to null (verify-only fastcrypto rows)', () => {
		const falcon = parseMystenBenchCsv(SAMPLE)[1];
		expect(falcon.skLen).toBeNull();
		expect(falcon.keygenNs).toBeNull();
		expect(falcon.signNs).toBeNull();
		expect(falcon.verifyNs).toBe(13208);
	});

	it('skips # comments and blank lines', () => {
		const csv = `# leading comment\n\n${MYSTEN_BENCH_HEADER}\n# mid comment\nEd25519,fastcrypto,32,64,32,1,1,100,,1000,1.00,—\n\n`;
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
		expect(() => parseMystenBenchCsv('scheme,impl,wrong\nfoo,bar,1\n')).toThrow(
			/Unexpected pq-sig-bench CSV header/
		);
	});

	it('rejects the previous (pre-impl-column) header format', () => {
		const old =
			'name,family,security_level,std,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519';
		expect(() => parseMystenBenchCsv(`${old}\n`)).toThrow(/Unexpected pq-sig-bench CSV header/);
	});

	it('tolerates CRLF line endings', () => {
		const csv = SAMPLE.replaceAll('\n', '\r\n');
		expect(parseMystenBenchCsv(csv)).toHaveLength(6);
	});
});

describe('aggregateByScheme', () => {
	it('collapses multi-impl schemes to one row, preserving first-seen order', () => {
		const aggs = aggregateByScheme(parseMystenBenchCsv(SAMPLE));
		expect(aggs.map((a) => a.scheme)).toEqual([
			'Ed25519',
			'FN-DSA-512',
			'ML-DSA-44',
			'SLH-DSA-SHAKE-128s',
		]);
	});

	it('averages timing fields over the impls that report them', () => {
		const aggs = aggregateByScheme(parseMystenBenchCsv(SAMPLE));
		const mldsa = aggs.find((a) => a.scheme === 'ML-DSA-44')!;
		expect(mldsa.verifyNs).toBeCloseTo((35583 + 14416) / 2, 5);
		expect(mldsa.signNs).toBeCloseTo((106958 + 37000) / 2, 5);
		expect(mldsa.vsEd25519).toBeCloseTo((1.27 + 0.52) / 2, 5);
		expect(mldsa.impls).toHaveLength(2);
	});

	it('a verify-only impl does not drag sign/keygen means to null or zero', () => {
		const aggs = aggregateByScheme(parseMystenBenchCsv(SAMPLE));
		const falcon = aggs.find((a) => a.scheme === 'FN-DSA-512')!;
		// fastcrypto row has no sign/keygen; the mean falls back to PQClean's values
		expect(falcon.signNs).toBe(144625);
		expect(falcon.keygenNs).toBe(4104500);
		expect(falcon.verifyNs).toBeCloseTo((13208 + 20416) / 2, 5);
	});

	it('single-impl schemes pass through unchanged', () => {
		const aggs = aggregateByScheme(parseMystenBenchCsv(SAMPLE));
		const slh = aggs.find((a) => a.scheme === 'SLH-DSA-SHAKE-128s')!;
		expect(slh.verifyNs).toBe(980500);
		expect(slh.vsEd25519).toBe(22.1);
		expect(slh.impls[0].impl).toBe(OLDER_RUN_IMPL);
	});

	it('all-null fields stay null', () => {
		const csv = `${MYSTEN_BENCH_HEADER}\nX,only,10,20,,,,,,1000,,\n`;
		const [agg] = aggregateByScheme(parseMystenBenchCsv(csv));
		expect(agg.keygenNs).toBeNull();
		expect(agg.signNs).toBeNull();
		expect(agg.verifyNs).toBeNull();
		expect(agg.vsEd25519).toBeNull();
	});

	it('returns [] for the pending (empty) state', () => {
		expect(aggregateByScheme([])).toEqual([]);
	});
});
