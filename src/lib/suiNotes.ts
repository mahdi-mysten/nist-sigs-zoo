// Assurance level of the implementation Sui would actually run for each measured
// scheme — the practical "how much can we trust this code" axis that sits next to
// the performance numbers. Two tiers, orthogonal to the `unaudited` flag below:
//   strong — machine-checked proofs and/or a completed independent audit
//   mid    — correctness gated on test vectors in CI (or, for FN-DSA-1024, not
//            even the implementation Sui would ship)
// `unaudited` marks "no completed independent security audit" regardless of tier
// — ML-DSA is `strong` (real proofs) and still `unaudited` (no audit exists yet),
// same as it would be at `mid`. The badge is the scannable term; the tooltip
// explains what it means. Facts verified against crate repos / NIST docs /
// pq-sig-bench's own README as of 2026-07.
export type AssuranceTier = 'strong' | 'mid';

export interface SuiAssurance {
	/** Headline term shown in the pill. */
	badge: string;
	/** Implementation named in the badge (shown in parentheses), when relevant. */
	impl?: string;
	/** Append a muted "· unaudited" — true when no independent security audit exists. */
	unaudited?: boolean;
	tier: AssuranceTier;
	/** One-line explanation of the term itself. */
	tip: string;
}

// Both measured SLH-DSA variants share one assurance story.
const SLH_DSA: SuiAssurance = {
	badge: 'ACVP-gated',
	unaudited: true,
	tier: 'mid',
	tip: "Verifier replays NIST's ACVP vectors (which include negative cases) as a CI pass/fail gate — proven conformant, but the Rust crates have no independent security audit yet.",
};

// aws-lc-rs doesn't implement ML-DSA itself — it delegates to mldsa-native (PQ
// Code Package / Linux Foundation), so all three benched levels share one story.
const ML_DSA: SuiAssurance = {
	badge: 'Formally verified',
	impl: 'mldsa-native',
	unaudited: true,
	tier: 'strong',
	tip: 'aws-lc-rs delegates ML-DSA to mldsa-native (PQ Code Package / Linux Foundation): CBMC proofs that the C has no undefined behavior, plus HOL Light proofs (via s2n-bignum) of functional correctness and constant-time execution for the AArch64 assembly. No independent third-party audit of ML-DSA exists yet for any Rust option, and AWS-LC’s FIPS 140-3 certification doesn’t cover ML-DSA yet (in CMVP review). Production users: rustls’s default provider, AWS KMS, AWS Private CA.',
};

export const SUI_ASSURANCE: Record<string, SuiAssurance> = {
	Ed25519: {
		badge: 'Audited',
		tier: 'strong',
		tip: 'Production code with independent security audits and years of adversarial exposure; the only scheme here that also batch-verifies.',
	},
	'FN-DSA-512': {
		badge: 'KAT-gated',
		unaudited: true,
		tier: 'mid',
		tip: "fastcrypto's Montgomery verifier is pinned to NIST's Falcon Round-3 Known-Answer Tests (100 vectors) as a CI pass/fail gate, and every benchmarked signature cross-verifies against PQClean's reference C in both directions — proven correct and interoperable, but not yet independently audited.",
	},
	'FN-DSA-1024': {
		badge: 'Reference impl',
		impl: 'PQClean C',
		unaudited: true,
		tier: 'mid',
		tip: "No fastcrypto implementation exists yet for FN-DSA-1024 — this row measures PQClean's portable reference C directly, not code Sui would ship. PQClean carries no independent security audit, and the repo is slated to be archived read-only in July 2026.",
	},
	'ML-DSA-44': ML_DSA,
	'ML-DSA-65': ML_DSA,
	'ML-DSA-87': ML_DSA,
	'SLH-DSA-SHAKE-128s': SLH_DSA,
	'SLH-DSA-SHAKE-128f': SLH_DSA,
};

export function suiAssuranceFor(name: string): SuiAssurance | undefined {
	return SUI_ASSURANCE[name] ?? (name.startsWith('SLH-DSA') ? SLH_DSA : undefined);
}
