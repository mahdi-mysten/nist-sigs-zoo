// Assurance level of the implementation Sui would actually run for each measured
// scheme — the practical "how much can we trust this code" axis that sits next to
// the performance numbers. Two tiers:
//   strong — independent audit, or machine-checked proofs
//   mid    — correctness gated on NIST test vectors in CI, but not yet audited
// The badge is the scannable term; the tooltip explains what the term means.
// Facts verified against crate repos / NIST docs as of 2026-07.
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
		tip: "fastcrypto's Montgomery verifier is pinned to NIST's Falcon Round-3 Known-Answer Tests (100 vectors) as a CI pass/fail gate — proven correct and interoperable with conformant signers, but not yet independently audited.",
	},
	'ML-DSA-44': {
		badge: 'Formally verified',
		impl: 'libcrux',
		tier: 'strong',
		tip: 'libcrux ships machine-checked (hax/F*) proofs over its core arithmetic plus ACVP conformance replay — a level above test-vector gating. An independent Sui-side audit is still wanted before guarding funds.',
	},
	'SLH-DSA-SHAKE-128s': SLH_DSA,
	'SLH-DSA-SHAKE-128f': SLH_DSA,
};

export function suiAssuranceFor(name: string): SuiAssurance | undefined {
	return SUI_ASSURANCE[name] ?? (name.startsWith('SLH-DSA') ? SLH_DSA : undefined);
}
