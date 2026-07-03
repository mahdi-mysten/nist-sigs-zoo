// Traffic-light shading for the size and timing cells, shared by the zoo table
// and the Sui lens. Buckets are anchored to the Sui tx-authenticator decision:
// Ed25519 (32 B pk + 64 B sig, ~45 µs verify) is the baseline every candidate is
// judged against, and the calibration points are the real contenders:
//
//   bucket        pk / sig / pk+sig (B)   verify (µs)   sign (µs)   anchor
//   green         ≤ 256                   ≤ 50          ≤ 100       Ed25519
//   light-green   ≤ 2,048                 ≤ 200         ≤ 1,000     Falcon-512
//   orange        ≤ 4,096                 ≤ 1,000       ≤ 10,000    ML-DSA-44
//   light-red     ≤ 10,240                ≤ 3,000       ≤ 100,000   SLH-DSA-SHAKE-128s
//   red           above                   above         above       UOV-class pks (~65 KB)
//
// Sizes share one scale for pk, sig, and pk+sig: on Sui the public key is stored
// once and the signature ships with every transaction, so both ends of the split
// hurt the same way at the same magnitude. Timings given as cycles must be
// converted with the zoo's own 2.5 GHz assumption (CPUSPEED / 1e6 = 2500
// cycles per µs) before bucketing — same conversion the tables display.

export type TrafficBucket = 'green' | 'light-green' | 'orange' | 'light-red' | 'red';

// Upper bounds (inclusive) of the first four buckets; anything above the last is red.
export const SIZE_THRESHOLDS_BYTES = [256, 2_048, 4_096, 10_240] as const;
export const VERIFY_THRESHOLDS_US = [50, 200, 1_000, 3_000] as const;
export const SIGN_THRESHOLDS_US = [100, 1_000, 10_000, 100_000] as const;

const BUCKETS: TrafficBucket[] = ['green', 'light-green', 'orange', 'light-red', 'red'];

export function bucketFor(value: number, thresholds: readonly number[]): TrafficBucket {
	const i = thresholds.findIndex((t) => value <= t);
	return BUCKETS[i === -1 ? thresholds.length : i];
}

// Subtle tints so the numbers stay readable on both themes; dark variants use
// low-opacity color over the midnight background instead of darker hues.
export const BUCKET_CLASSES: Record<TrafficBucket, string> = {
	green: 'bg-green-200/70 dark:bg-green-500/25',
	'light-green': 'bg-green-100/70 dark:bg-green-500/10',
	orange: 'bg-orange-200/70 dark:bg-orange-500/20',
	'light-red': 'bg-red-100/70 dark:bg-red-500/10',
	red: 'bg-red-200/80 dark:bg-red-500/25',
};

// Cell helpers: null/undefined means "no data" and renders unshaded.
export function sizeCellClass(bytes: number | null | undefined): string {
	return bytes == null ? '' : BUCKET_CLASSES[bucketFor(bytes, SIZE_THRESHOLDS_BYTES)];
}

export function verifyCellClass(us: number | null | undefined): string {
	return us == null ? '' : BUCKET_CLASSES[bucketFor(us, VERIFY_THRESHOLDS_US)];
}

export function signCellClass(us: number | null | undefined): string {
	return us == null ? '' : BUCKET_CLASSES[bucketFor(us, SIGN_THRESHOLDS_US)];
}
