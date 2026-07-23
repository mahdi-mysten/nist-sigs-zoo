export const CPUSPEED = 2_500_000_000;

export const NIST_LEVELS = [1, 2, 3, 4, 5] as const;

export const ALL_LEVELS = ['Pre-Quantum', 1, 2, 3, 4, 5] as const;

// Schemes on a FIPS track whose YAML has no FIPS-numbered version entry yet —
// lets the Status column name the standard that is pending. Drop an entry once
// the scheme gains a "FIPS <n>" version in its YAML.
export const PENDING_FIPS: Record<string, string> = {
	Falcon: 'FIPS 206',
};

// The schemes we have our own measurements for, in display order. Shared by the
// Sui lens table and the sign-vs-size chart so the two can't drift apart; both
// key rows by these names. The zoo scatter/table below are a different dataset
// (every YAML parameter set at every level) and are not driven by this list.
export const DISPLAY_SCHEMES = [
	'Ed25519',
	'FN-DSA-512',
	'FN-DSA-1024',
	'ML-DSA-44',
	'ML-DSA-65',
	'ML-DSA-87',
	'SLH-DSA-SHAKE-128s',
	'SLH-DSA-SHAKE-128f',
	'SLH-DSA-SHA2-128s',
	'SLH-DSA-SHA2-128f',
] as const;

// The parameter set Sui is going with for its PQ authenticator. Defined once so
// the Sui lens row and the zoo scatter point can't drift apart: the lens keys
// rows by the measured/harness name, the zoo keys them by (scheme, parameterset)
// from the YAML, and for ML-DSA those happen to differ in shape but not value.
export const SUI_PICK = {
	/** Zoo scheme name — `name:` in data/schemes/*.yaml. */
	scheme: 'ML-DSA',
	/** Zoo parameter-set name, and the Sui lens's measured row key. */
	parameterset: 'ML-DSA-65',
	badge: 'Our pick',
} as const;
