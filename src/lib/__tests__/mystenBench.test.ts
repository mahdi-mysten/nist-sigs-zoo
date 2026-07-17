import { describe, it, expect } from 'vitest';
import {
	MYSTEN_BENCH_HEADER,
	OLDER_RUN_IMPL,
	aggregateByScheme,
	parseMystenBenchCsv,
} from '$lib/mystenBench';

const SAMPLE = `${MYSTEN_BENCH_HEADER}
Ed25519,fastcrypto (baseline),32,64,,10400,11200,27900,,1000,1.00
FN-DSA-512,fastcrypto,897,666,,8330000,2750000,13200,,1000,0.47
ML-DSA-44,aws-lc-rs-a,1312,2420,,18000,46700,14500,,1000,0.52
ML-DSA-44,aws-lc-rs-b,1312,2420,,20000,50000,15000,,1000,0.54
SLH-DSA-SHAKE-128s,${OLDER_RUN_IMPL},32,7856,64,129455667,991862791,980500,,1000,22.1
`;

describe('parseMystenBenchCsv', () => {
	it('parses rows with numeric and empty fields', () => {
		const rows = parseMystenBenchCsv(SAMPLE);
		expect(rows).toHaveLength(5);

		const falcon = rows[1];
		expect(falcon.scheme).toBe('FN-DSA-512');
		expect(falcon.impl).toBe('fastcrypto');
		expect(falcon.pkLen).toBe(897);
		expect(falcon.sigLen).toBe(666);
		expect(falcon.verifyNs).toBe(13200);
		expect(falcon.verifyCyc).toBeNull(); // empty column
		expect(falcon.verifyIters).toBe(1000);
		expect(falcon.vsEd25519).toBe(0.47);
	});

	it('empty sk_len/verify_cyc parse to null', () => {
		const [ed] = parseMystenBenchCsv(SAMPLE);
		expect(ed.skLen).toBeNull();
		expect(ed.verifyCyc).toBeNull();
		expect(ed.keygenNs).toBe(10400);
	});

	it('skips # comments and blank lines', () => {
		const csv = `# leading comment\n\n${MYSTEN_BENCH_HEADER}\n# mid comment\nEd25519,fastcrypto,32,64,,1,1,100,,1000,1.00\n\n`;
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

	it('rejects the previous (vs_pqclean-column) header format', () => {
		const old =
			'scheme,impl,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519,vs_pqclean';
		expect(() => parseMystenBenchCsv(`${old}\n`)).toThrow(/Unexpected pq-sig-bench CSV header/);
	});

	it('tolerates CRLF line endings', () => {
		const csv = SAMPLE.replaceAll('\n', '\r\n');
		expect(parseMystenBenchCsv(csv)).toHaveLength(5);
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
		expect(mldsa.verifyNs).toBeCloseTo((14500 + 15000) / 2, 5);
		expect(mldsa.signNs).toBeCloseTo((46700 + 50000) / 2, 5);
		expect(mldsa.vsEd25519).toBeCloseTo((0.52 + 0.54) / 2, 5);
		expect(mldsa.impls).toHaveLength(2);
	});

	it('single-impl schemes pass through unchanged', () => {
		const aggs = aggregateByScheme(parseMystenBenchCsv(SAMPLE));
		const falcon = aggs.find((a) => a.scheme === 'FN-DSA-512')!;
		expect(falcon.signNs).toBe(2750000);
		expect(falcon.keygenNs).toBe(8330000);
		expect(falcon.verifyNs).toBe(13200);
		expect(falcon.impls).toHaveLength(1);
	});

	it('older-run rows pass through unchanged', () => {
		const aggs = aggregateByScheme(parseMystenBenchCsv(SAMPLE));
		const slh = aggs.find((a) => a.scheme === 'SLH-DSA-SHAKE-128s')!;
		expect(slh.verifyNs).toBe(980500);
		expect(slh.vsEd25519).toBe(22.1);
		expect(slh.impls[0].impl).toBe(OLDER_RUN_IMPL);
	});

	it('all-null fields stay null', () => {
		const csv = `${MYSTEN_BENCH_HEADER}\nX,only,10,20,,,,,,1000,\n`;
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
