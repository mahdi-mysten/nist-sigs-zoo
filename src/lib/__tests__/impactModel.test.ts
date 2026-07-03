import { describe, it, expect } from 'vitest';
import {
	ED25519_ENVELOPE_BYTES,
	IMPACT_PRESETS,
	adoptionSweep,
	clampAssumptions,
	computeImpact,
	ed25519Baseline,
	envelopeBytes,
	findBindingCrossover,
	tpsBucket,
	type ImpactAssumptions,
} from '$lib/impactModel';

// Mirrors data/mysten/mac-m2-max.csv (verify_ns / 1000 and pk/sig lengths) —
// the same rows the SuiImpact section feeds the model at runtime.
const ED_VERIFY_US = 44.375;
const FALCON = { verifyUs: 16.042, envelopeBytes: envelopeBytes(897, 666) };
const SLH_128S = { verifyUs: 980.5, envelopeBytes: envelopeBytes(32, 7856) };

const BLOG = IMPACT_PRESETS.find((p) => p.id === 'blog')!.assumptions;
const CONSERVATIVE = IMPACT_PRESETS.find((p) => p.id === 'conservative')!.assumptions;

describe('envelopeBytes', () => {
	it('is 1 flag byte + sig + pk; Ed25519 comes to 97', () => {
		expect(envelopeBytes(32, 64)).toBe(97);
		expect(ED25519_ENVELOPE_BYTES).toBe(97);
		expect(FALCON.envelopeBytes).toBe(1564); // 1 + 666 + 897
		expect(SLH_128S.envelopeBytes).toBe(7889); // 1 + 7856 + 32
	});
});

describe('computeImpact bound formulas', () => {
	// Clean numbers so every expectation is hand-checkable; batch factor 1 keeps
	// the raw formulas visible (the factor gets its own test below).
	const A: ImpactAssumptions = {
		verifyCores: 10,
		nicGbps: 8,
		nicUtilization: 0.5,
		ceilingTps: 1e9,
		finalityMs: 100,
		baseTxBytes: 300,
		ed25519BatchFactor: 1,
	};

	it('verify bound = cores × 1e6 / avg_verify_us', () => {
		const r = computeImpact({ verifyUs: 200, envelopeBytes: 700, adoption: 1, ed25519VerifyUs: 50 }, A);
		expect(r.avgVerifyUs).toBe(200);
		expect(r.verifyBoundTps).toBeCloseTo(50_000, 6);
	});

	it('bandwidth bound = gbps × 1e9 × utilization / (8 × avg_tx_bytes)', () => {
		const r = computeImpact({ verifyUs: 200, envelopeBytes: 700, adoption: 1, ed25519VerifyUs: 50 }, A);
		expect(r.avgTxBytes).toBe(1000); // 300 base + 700 envelope
		expect(r.bandwidthBoundTps).toBeCloseTo(500_000, 6);
	});

	it('mixes verify time and bytes linearly in adoption', () => {
		const r = computeImpact({ verifyUs: 200, envelopeBytes: 700, adoption: 0.25, ed25519VerifyUs: 50 }, A);
		expect(r.avgVerifyUs).toBeCloseTo(0.25 * 200 + 0.75 * 50, 9); // 87.5
		expect(r.avgTxBytes).toBeCloseTo(300 + 0.25 * 700 + 0.75 * 97, 9); // 547.75
	});

	it('clamps adoption outside [0,1]', () => {
		const at = (adoption: number) =>
			computeImpact({ verifyUs: 200, envelopeBytes: 700, adoption, ed25519VerifyUs: 50 }, A);
		expect(at(1.5)).toEqual(at(1));
		expect(at(-0.2)).toEqual(at(0));
	});

	it('divides only the Ed25519 share by the batch factor', () => {
		const batched = { ...A, ed25519BatchFactor: 2 };
		const r = computeImpact({ verifyUs: 200, envelopeBytes: 700, adoption: 0.25, ed25519VerifyUs: 50 }, batched);
		expect(r.avgVerifyUs).toBeCloseTo(0.25 * 200 + 0.75 * 25, 9); // PQ share untouched
		const full = computeImpact({ verifyUs: 200, envelopeBytes: 700, adoption: 1, ed25519VerifyUs: 50 }, batched);
		expect(full.avgVerifyUs).toBe(200); // 100% PQ: the factor is irrelevant
	});
});

describe('computeImpact min/argmin', () => {
	const scenario = { verifyUs: 200, envelopeBytes: 700, adoption: 1, ed25519VerifyUs: 50 };
	const base: ImpactAssumptions = {
		verifyCores: 10,
		nicGbps: 8,
		nicUtilization: 0.5,
		ceilingTps: 1e9,
		finalityMs: 100,
		baseTxBytes: 300,
		ed25519BatchFactor: 1,
	};

	it('verify binds when it is the smallest bound', () => {
		const r = computeImpact(scenario, base); // verify 50k < bw 500k < ceiling
		expect(r.binding).toBe('verify');
		expect(r.effectiveTps).toBeCloseTo(50_000, 6);
	});

	it('bandwidth binds when the NIC shrinks', () => {
		const r = computeImpact(scenario, { ...base, nicGbps: 0.08 }); // bw 5k < verify 50k
		expect(r.binding).toBe('bandwidth');
		expect(r.effectiveTps).toBeCloseTo(5_000, 6);
	});

	it('ceiling binds when it drops below both crypto bounds', () => {
		const r = computeImpact(scenario, { ...base, ceilingTps: 40_000 });
		expect(r.binding).toBe('ceiling');
		expect(r.effectiveTps).toBe(40_000);
	});

	it('ties resolve toward the ceiling', () => {
		// verify bound = 1e6/100 = 10,000 exactly equals the ceiling.
		const r = computeImpact(
			{ verifyUs: 100, envelopeBytes: 700, adoption: 1, ed25519VerifyUs: 100 },
			{ ...base, verifyCores: 1, ceilingTps: 10_000 }
		);
		expect(r.effectiveTps).toBe(10_000);
		expect(r.binding).toBe('ceiling');
	});
});

describe('presets', () => {
	it('blog testbed carries the documented defaults', () => {
		expect(BLOG).toEqual({
			verifyCores: 8,
			nicGbps: 25,
			nicUtilization: 0.5,
			ceilingTps: 297_000,
			finalityMs: 480,
			baseTxBytes: 400,
			ed25519BatchFactor: 2,
		});
	});

	it('docs-minimum differs from blog only in the 1 Gbps NIC', () => {
		const docsMin = IMPACT_PRESETS.find((p) => p.id === 'docs-min')!.assumptions;
		expect(docsMin).toEqual({ ...BLOG, nicGbps: 1 });
	});

	it('conservative differs from blog only in the 100k ceiling', () => {
		expect(CONSERVATIVE).toEqual({ ...BLOG, ceilingTps: 100_000 });
	});
});

describe('binding crossover', () => {
	// Batched Ed25519 is what a validator actually runs: 44.375/2 ≈ 22.19 µs.
	const BATCHED_ED_US = ED_VERIFY_US / BLOG.ed25519BatchFactor;

	it('blog baseline is ceiling-bound: batched Ed25519 clears the ceiling', () => {
		// 8e6 / 22.19 ≈ 360,563 TPS > 297,000 — verification is not the chain's
		// bottleneck today, which is exactly the premise the section teaches.
		const r = ed25519Baseline(ED_VERIFY_US, BLOG);
		expect(r.verifyBoundTps).toBeCloseTo((8 * 1e6) / BATCHED_ED_US, 6);
		expect(r.binding).toBe('ceiling');
		expect(r.effectiveTps).toBe(BLOG.ceilingTps);
	});

	it('Falcon-512 under blog defaults never flips: the ceiling binds from 0% to 100%', () => {
		// Falcon verifies faster than even batched Ed25519, so the verify bound
		// only rises with adoption and never dips below the ceiling; bandwidth
		// (≈795k TPS at 100%) never binds either. A faster verifier buys nothing.
		expect(findBindingCrossover(FALCON, ED_VERIFY_US, BLOG)).toBeNull();
		const full = computeImpact({ ...FALCON, adoption: 1, ed25519VerifyUs: ED_VERIFY_US }, BLOG);
		expect(full.binding).toBe('ceiling');
		expect(full.effectiveTps).toBe(ed25519Baseline(ED_VERIFY_US, BLOG).effectiveTps); // Δ = 0
	});

	it('SLH-DSA-SHAKE-128s under blog defaults flips ceiling → verify near 0.5% adoption', () => {
		// The verify bound falls below the 297k ceiling where
		// avg_verify_us = 8e6/297000 ≈ 26.94 µs:
		// a* = (8e6/ceiling − v_ed_batched) / (v_slh − v_ed_batched).
		const aStar =
			((BLOG.verifyCores * 1e6) / BLOG.ceilingTps - BATCHED_ED_US) /
			(SLH_128S.verifyUs - BATCHED_ED_US);
		const found = findBindingCrossover(SLH_128S, ED_VERIFY_US, BLOG);
		expect(found).not.toBeNull();
		expect(found!).toBeCloseTo(aStar, 6); // ≈ 0.00496
		expect(computeImpact({ ...SLH_128S, adoption: aStar - 1e-4, ed25519VerifyUs: ED_VERIFY_US }, BLOG).binding).toBe('ceiling');
		expect(computeImpact({ ...SLH_128S, adoption: aStar + 1e-4, ed25519VerifyUs: ED_VERIFY_US }, BLOG).binding).toBe('verify');
	});

	it('SLH-DSA-SHAKE-128s under the conservative ceiling flips ceiling → verify near 6% adoption', () => {
		// Ceiling 100k → the flip sits where avg_verify_us = 8e6/1e5 = 80 µs:
		// a* = (80 − v_ed_batched) / (v_slh − v_ed_batched).
		const aStar =
			((CONSERVATIVE.verifyCores * 1e6) / CONSERVATIVE.ceilingTps - BATCHED_ED_US) /
			(SLH_128S.verifyUs - BATCHED_ED_US);
		expect(ed25519Baseline(ED_VERIFY_US, CONSERVATIVE).binding).toBe('ceiling');
		const found = findBindingCrossover(SLH_128S, ED_VERIFY_US, CONSERVATIVE);
		expect(found).not.toBeNull();
		expect(found!).toBeCloseTo(aStar, 6); // ≈ 0.0603
	});
});

describe('adoptionSweep', () => {
	it('returns steps+1 points from 0 to 1, endpoints matching direct computation', () => {
		const sweep = adoptionSweep(SLH_128S, ED_VERIFY_US, BLOG);
		expect(sweep).toHaveLength(101);
		expect(sweep[0].adoption).toBe(0);
		expect(sweep[0].effectiveTps).toBe(ed25519Baseline(ED_VERIFY_US, BLOG).effectiveTps);
		expect(sweep[100].adoption).toBe(1);
		expect(sweep[100].effectiveTps).toBe(
			computeImpact({ ...SLH_128S, adoption: 1, ed25519VerifyUs: ED_VERIFY_US }, BLOG).effectiveTps
		);
	});
});

describe('finality estimate', () => {
	it('adds a·max(0, v_S − v_ed_batched) microseconds on top of the consensus baseline', () => {
		const batchedEd = ED_VERIFY_US / BLOG.ed25519BatchFactor; // 22.1875
		const full = computeImpact({ ...SLH_128S, adoption: 1, ed25519VerifyUs: ED_VERIFY_US }, BLOG);
		expect(full.finalityCryptoUs).toBeCloseTo(980.5 - batchedEd, 9); // 958.3125 µs
		expect(full.finalityMs).toBeCloseTo(480 + 0.9583125, 9);

		const half = computeImpact({ ...SLH_128S, adoption: 0.5, ed25519VerifyUs: ED_VERIFY_US }, BLOG);
		expect(half.finalityCryptoUs).toBeCloseTo(958.3125 / 2, 9);
	});

	it('a verifier faster than Ed25519 adds nothing (never negative)', () => {
		const r = computeImpact({ ...FALCON, adoption: 1, ed25519VerifyUs: ED_VERIFY_US }, BLOG);
		expect(r.finalityCryptoUs).toBe(0);
		expect(r.finalityMs).toBe(480);
	});
});

describe('tpsBucket', () => {
	it('≥90% of baseline is green, ≥50% orange, below red (boundaries inclusive)', () => {
		expect(tpsBucket(90, 100)).toBe('green');
		expect(tpsBucket(297_000, 180_283)).toBe('green'); // above baseline is green too
		expect(tpsBucket(89.9, 100)).toBe('orange');
		expect(tpsBucket(50, 100)).toBe('orange');
		expect(tpsBucket(49.9, 100)).toBe('red');
	});
});

describe('clampAssumptions', () => {
	it('replaces non-finite fields with blog defaults', () => {
		const cleaned = clampAssumptions({ ...BLOG, nicGbps: NaN, ceilingTps: Infinity });
		expect(cleaned.nicGbps).toBe(25);
		expect(cleaned.ceilingTps).toBe(297_000);
	});

	it('clamps cores to the 1–24 slider range and utilization to a fraction', () => {
		const cleaned = clampAssumptions({ ...BLOG, verifyCores: 0, nicUtilization: 1.5 });
		expect(cleaned.verifyCores).toBe(1);
		expect(cleaned.nicUtilization).toBe(1);
		expect(clampAssumptions({ ...BLOG, verifyCores: 99 }).verifyCores).toBe(24);
	});

	it('passes valid assumptions through unchanged', () => {
		expect(clampAssumptions(BLOG)).toEqual(BLOG);
	});
});
