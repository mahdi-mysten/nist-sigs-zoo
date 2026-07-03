// Capacity model behind "What PQ signatures do to the chain" (SuiImpact.svelte).
//
// This is a MODEL, not a measurement. Modeled chain throughput is the minimum
// of three independently computed bounds:
//
//   verify     verify_cores × 1e6 / avg_verify_us
//   bandwidth  nic_gbps × 1e9 × nic_utilization / (8 × avg_tx_bytes)
//   ceiling    a constant standing in for consensus + execution, i.e.
//              everything that is neither crypto nor bytes
//
// A scenario mixes one PQ scheme at adoption a ∈ [0,1] with Ed25519 for the
// remaining traffic. Real validators batch-verify Ed25519 (ed25519-consensus),
// so the Ed25519 share gets an amortized per-signature speedup; no PQ scheme in
// the table has a batch verifier, so v_S stays as measured:
//
//   avg_verify_us = a·v_S + (1−a)·(v_ed / batch_factor)
//   avg_tx_bytes  = base_tx_bytes + a·env_S + (1−a)·env_ed
//
// Known simplifications, on purpose:
// - Ed25519 batching is a flat amortized factor (default 2×), not a model of
//   batch sizes; set it to 1 to see the unbatched world.
// - The ceiling is a flat constant, not a function of tx size or effects.
// - Capacity only: at offered load ≥ effective TPS queues grow without bound.
//   Nothing here models queueing delay.

// === Assumptions & presets ===

export interface ImpactAssumptions {
	/** Cores a validator spends on signature checks (of the testbed's 24; the rest run consensus + execution). */
	verifyCores: number;
	/** NIC line rate in Gbit/s. */
	nicGbps: number;
	/** Share of the NIC realistically available for tx dissemination; gossip, checkpoints and sync eat the rest. */
	nicUtilization: number;
	/** Consensus + execution ceiling in TPS: everything that is neither crypto nor bytes. */
	ceilingTps: number;
	/** Uncongested p50 finality in ms; crypto adds on top of this. */
	finalityMs: number;
	/** Serialized transaction bytes without the user signature envelope. */
	baseTxBytes: number;
	/**
	 * Amortized per-signature speedup for the Ed25519 share from batch
	 * verification (ed25519-consensus). No PQ scheme in the table has a batch
	 * verifier, so this never touches v_S. 1 = unbatched.
	 */
	ed25519BatchFactor: number;
}

export type ImpactPresetId = 'blog' | 'docs-min' | 'conservative';

export interface ImpactPreset {
	id: ImpactPresetId;
	label: string;
	/** One-line provenance shown as the button tooltip. */
	note: string;
	assumptions: ImpactAssumptions;
}

// Defaults from the Sui performance update blog testbed
// (https://blog.sui.io/sui-performance-update/): 100 validators, 24-core AMD,
// 25 Gbps NIC, 10,871–297,000 TPS depending on PTB size, ~480 ms p50 finality.
const BLOG_ASSUMPTIONS: ImpactAssumptions = {
	verifyCores: 8,
	nicGbps: 25,
	nicUtilization: 0.5,
	ceilingTps: 297_000,
	finalityMs: 480,
	baseTxBytes: 400,
	ed25519BatchFactor: 2,
};

export const IMPACT_PRESETS: readonly ImpactPreset[] = [
	{
		id: 'blog',
		label: 'Blog testbed',
		note: '100 validators, 24-core AMD, 25 Gbps, 297k TPS best case, ~480 ms p50 (blog.sui.io/sui-performance-update)',
		assumptions: BLOG_ASSUMPTIONS,
	},
	{
		id: 'docs-min',
		label: 'Docs-minimum validator',
		note: 'Same testbed, but the 1 Gbps NIC that the Sui validator operator docs list as the minimum',
		assumptions: { ...BLOG_ASSUMPTIONS, nicGbps: 1 },
	},
	{
		id: 'conservative',
		label: 'Conservative ceiling',
		note: 'Same testbed, but consensus + execution capped at 100k TPS instead of the blog best case',
		assumptions: { ...BLOG_ASSUMPTIONS, ceilingTps: 100_000 },
	},
];

// UI guard: the assumptions panel binds raw <input> values, so a cleared field
// arrives as NaN. Non-finite fields fall back to the blog preset; the rest are
// clamped to ranges where the model stays meaningful (cores match the 1–24
// slider, utilization is a fraction of the NIC).
export function clampAssumptions(a: ImpactAssumptions): ImpactAssumptions {
	const or = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	return {
		verifyCores: clamp(Math.round(or(a.verifyCores, BLOG_ASSUMPTIONS.verifyCores)), 1, 24),
		nicGbps: clamp(or(a.nicGbps, BLOG_ASSUMPTIONS.nicGbps), 0.001, 10_000),
		nicUtilization: clamp(or(a.nicUtilization, BLOG_ASSUMPTIONS.nicUtilization), 0.01, 1),
		ceilingTps: clamp(or(a.ceilingTps, BLOG_ASSUMPTIONS.ceilingTps), 1, 1e9),
		finalityMs: clamp(or(a.finalityMs, BLOG_ASSUMPTIONS.finalityMs), 0, 1e6),
		baseTxBytes: clamp(or(a.baseTxBytes, BLOG_ASSUMPTIONS.baseTxBytes), 1, 1e9),
		ed25519BatchFactor: clamp(or(a.ed25519BatchFactor, BLOG_ASSUMPTIONS.ed25519BatchFactor), 1, 100),
	};
}

// === Signature envelopes ===

/** Sui user-signature envelope: 1 flag byte + signature + public key. */
export function envelopeBytes(pkLen: number, sigLen: number): number {
	return 1 + sigLen + pkLen;
}

/** envelopeBytes(32, 64) — the Ed25519 remainder every scenario mixes in. */
export const ED25519_ENVELOPE_BYTES = envelopeBytes(32, 64);

// === The model ===

export type BoundId = 'verify' | 'bandwidth' | 'ceiling';

export const BOUND_LABELS: Record<BoundId, string> = {
	verify: 'verification CPU',
	bandwidth: 'validator bandwidth',
	ceiling: 'consensus & execution ceiling',
};

/** Per-scheme costs a scenario needs: verify median (µs, measured) and wire envelope (bytes). */
export interface SchemeCosts {
	verifyUs: number;
	envelopeBytes: number;
}

export interface ImpactScenario extends SchemeCosts {
	/** Fraction of traffic on the PQ scheme; the rest stays Ed25519. Clamped to [0,1]. */
	adoption: number;
	/** Same-host Ed25519 verify median in µs — never mix hosts. */
	ed25519VerifyUs: number;
}

export interface ImpactResult {
	avgVerifyUs: number;
	avgTxBytes: number;
	verifyBoundTps: number;
	bandwidthBoundTps: number;
	ceilingTps: number;
	/** min of the three bounds. */
	effectiveTps: number;
	/** argmin; ties resolve toward the coarser bound (ceiling, then bandwidth). */
	binding: BoundId;
	/** finalityMs assumption + the crypto delta below, in ms. */
	finalityMs: number;
	/** a·max(0, v_S − v_ed): crypto adds at most one verify to the critical path, in µs. */
	finalityCryptoUs: number;
}

export function computeImpact(s: ImpactScenario, assumptions: ImpactAssumptions): ImpactResult {
	const a = Math.min(1, Math.max(0, s.adoption));
	// Batch verification only exists for Ed25519; the PQ share pays full price.
	const batchedEdUs = s.ed25519VerifyUs / assumptions.ed25519BatchFactor;
	const avgVerifyUs = a * s.verifyUs + (1 - a) * batchedEdUs;
	const avgTxBytes = assumptions.baseTxBytes + a * s.envelopeBytes + (1 - a) * ED25519_ENVELOPE_BYTES;

	const verifyBoundTps = (assumptions.verifyCores * 1e6) / avgVerifyUs;
	const bandwidthBoundTps = (assumptions.nicGbps * 1e9 * assumptions.nicUtilization) / (8 * avgTxBytes);

	// argmin with ties resolved toward the coarser bound: when a crypto bound
	// merely equals the ceiling, the ceiling is still what stops you.
	let binding: BoundId = 'ceiling';
	let effectiveTps = assumptions.ceilingTps;
	if (bandwidthBoundTps < effectiveTps) {
		effectiveTps = bandwidthBoundTps;
		binding = 'bandwidth';
	}
	if (verifyBoundTps < effectiveTps) {
		effectiveTps = verifyBoundTps;
		binding = 'verify';
	}

	// Verification touches the latency path exactly once (check before vote), so
	// the finality delta is microseconds against a ~480 ms consensus budget.
	// Compared against the batched Ed25519 a validator actually runs today.
	// Only holds below capacity — see the queueing caveat in the header comment.
	const finalityCryptoUs = a * Math.max(0, s.verifyUs - batchedEdUs);

	return {
		avgVerifyUs,
		avgTxBytes,
		verifyBoundTps,
		bandwidthBoundTps,
		ceilingTps: assumptions.ceilingTps,
		effectiveTps,
		binding,
		finalityMs: assumptions.finalityMs + finalityCryptoUs / 1000,
		finalityCryptoUs,
	};
}

/** The Ed25519-only reference every scenario is compared against (adoption 0). */
export function ed25519Baseline(ed25519VerifyUs: number, assumptions: ImpactAssumptions): ImpactResult {
	return computeImpact(
		{ verifyUs: ed25519VerifyUs, envelopeBytes: ED25519_ENVELOPE_BYTES, adoption: 0, ed25519VerifyUs },
		assumptions
	);
}

/** Effective TPS (and binding bound) at adoption 0, 1/steps, …, 1 — feeds the sweep chart. */
export function adoptionSweep(
	scheme: SchemeCosts,
	ed25519VerifyUs: number,
	assumptions: ImpactAssumptions,
	steps = 100
): ({ adoption: number } & ImpactResult)[] {
	return Array.from({ length: steps + 1 }, (_, i) => {
		const adoption = i / steps;
		return { adoption, ...computeImpact({ ...scheme, adoption, ed25519VerifyUs }, assumptions) };
	});
}

/**
 * Smallest adoption in (0, 1] where the binding bound differs from its value at
 * adoption 0, or null if one bound binds across the whole range.
 *
 * Scan-then-bisect: all three bounds are monotone in adoption (avg_verify_us and
 * avg_tx_bytes are linear in a, the ceiling is flat), so between two consecutive
 * scan points a binding change brackets a single crossover for the bisection.
 */
export function findBindingCrossover(
	scheme: SchemeCosts,
	ed25519VerifyUs: number,
	assumptions: ImpactAssumptions,
	resolution = 1000
): number | null {
	const bindingAt = (adoption: number) =>
		computeImpact({ ...scheme, adoption, ed25519VerifyUs }, assumptions).binding;

	const b0 = bindingAt(0);
	let hit = -1;
	for (let i = 1; i <= resolution; i++) {
		if (bindingAt(i / resolution) !== b0) {
			hit = i;
			break;
		}
	}
	if (hit === -1) return null;

	let lo = (hit - 1) / resolution;
	let hi = hit / resolution;
	for (let k = 0; k < 50; k++) {
		const mid = (lo + hi) / 2;
		if (bindingAt(mid) === b0) lo = mid;
		else hi = mid;
	}
	return hi;
}

// === Card shading ===

/**
 * Traffic-light bucket for the Effective TPS card, relative to the Ed25519-only
 * baseline under the same assumptions: ≥90% of baseline is green, ≥50% orange,
 * below that red. Rendered with the zoo's shared palette (trafficLight.ts).
 */
export function tpsBucket(scenarioTps: number, baselineTps: number): 'green' | 'orange' | 'red' {
	const ratio = scenarioTps / baselineTps;
	return ratio >= 0.9 ? 'green' : ratio >= 0.5 ? 'orange' : 'red';
}
