export const CPUSPEED = 2_500_000_000;

export const NIST_LEVELS = [1, 2, 3, 4, 5] as const;

export const ALL_LEVELS = ['Pre-Quantum', 1, 2, 3, 4, 5] as const;

// Schemes on a FIPS track whose YAML has no FIPS-numbered version entry yet —
// lets the Status column name the standard that is pending. Drop an entry once
// the scheme gains a "FIPS <n>" version in its YAML.
export const PENDING_FIPS: Record<string, string> = {
	Falcon: 'FIPS 206',
};
