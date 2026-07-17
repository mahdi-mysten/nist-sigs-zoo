import { describe, it, expect } from 'vitest';
import {
	bucketFor,
	sizeCellClass,
	signCellClass,
	verifyCellClass,
	BUCKET_CLASSES,
	SIZE_THRESHOLDS_BYTES,
	VERIFY_THRESHOLDS_US,
	SIGN_THRESHOLDS_US,
} from '$lib/trafficLight';

// The buckets are calibrated to the Sui tx-authenticator anchors; if these
// break, the thresholds moved and the docs comment in trafficLight.ts is stale.
describe('size buckets (pk / sig / pk+sig share one scale)', () => {
	it('Ed25519 pk+sig (96 B) is green', () => {
		expect(bucketFor(32 + 64, SIZE_THRESHOLDS_BYTES)).toBe('green');
	});

	it('Falcon-512 pk+sig (1,563 B) is light-green', () => {
		expect(bucketFor(897 + 666, SIZE_THRESHOLDS_BYTES)).toBe('light-green');
	});

	it('ML-DSA-44 pk+sig (3,732 B) is orange', () => {
		expect(bucketFor(1312 + 2420, SIZE_THRESHOLDS_BYTES)).toBe('orange');
	});

	it('SLH-DSA-SHAKE-128s pk+sig (7,888 B) is light-red', () => {
		expect(bucketFor(32 + 7856, SIZE_THRESHOLDS_BYTES)).toBe('light-red');
	});

	it('SLH-DSA-SHAKE-128f pk+sig (17,120 B) is red', () => {
		expect(bucketFor(32 + 17088, SIZE_THRESHOLDS_BYTES)).toBe('red');
	});

	it('a 65 KB UOV public key is red', () => {
		expect(bucketFor(66576, SIZE_THRESHOLDS_BYTES)).toBe('red');
	});

	it('bucket edges are inclusive', () => {
		expect(bucketFor(256, SIZE_THRESHOLDS_BYTES)).toBe('green');
		expect(bucketFor(257, SIZE_THRESHOLDS_BYTES)).toBe('light-green');
		expect(bucketFor(10_240, SIZE_THRESHOLDS_BYTES)).toBe('light-red');
		expect(bucketFor(10_241, SIZE_THRESHOLDS_BYTES)).toBe('red');
	});
});

describe('verify-time buckets (µs)', () => {
	it('Ed25519 measured verify (~44 µs) is green', () => {
		expect(bucketFor(44.4, VERIFY_THRESHOLDS_US)).toBe('green');
	});

	it('Falcon-512 measured verify (~16 µs) is green', () => {
		expect(bucketFor(16.0, VERIFY_THRESHOLDS_US)).toBe('green');
	});

	it('SLH-DSA-SHAKE-128s measured verify (~980 µs) is orange', () => {
		expect(bucketFor(980.5, VERIFY_THRESHOLDS_US)).toBe('orange');
	});

	it('SLH-DSA-SHAKE-128f measured verify (~2,845 µs) is light-red', () => {
		expect(bucketFor(2845.3, VERIFY_THRESHOLDS_US)).toBe('light-red');
	});

	it('anything above 3 ms is red', () => {
		expect(bucketFor(3001, VERIFY_THRESHOLDS_US)).toBe('red');
	});
});

describe('sign-time buckets (µs)', () => {
	it('Ed25519 measured sign (~27 µs) is green', () => {
		expect(bucketFor(27.4, SIGN_THRESHOLDS_US)).toBe('green');
	});

	it('ML-DSA-44 measured sign (~90 µs) is green', () => {
		expect(bucketFor(90.0, SIGN_THRESHOLDS_US)).toBe('green');
	});

	it('SLH-DSA-SHAKE-128f sign (~48 ms) is light-red', () => {
		expect(bucketFor(48_020, SIGN_THRESHOLDS_US)).toBe('light-red');
	});

	it('SLH-DSA-SHAKE-128s sign (~992 ms) is red', () => {
		expect(bucketFor(991_863, SIGN_THRESHOLDS_US)).toBe('red');
	});
});

describe('cell class helpers', () => {
	it('map buckets to Tailwind classes', () => {
		expect(sizeCellClass(96)).toBe(BUCKET_CLASSES['green']);
		expect(sizeCellClass(66576)).toBe(BUCKET_CLASSES['red']);
		expect(verifyCellClass(44.4)).toBe(BUCKET_CLASSES['green']);
		expect(signCellClass(991_863)).toBe(BUCKET_CLASSES['red']);
	});

	it('null/undefined (no data) renders unshaded', () => {
		expect(sizeCellClass(null)).toBe('');
		expect(verifyCellClass(undefined)).toBe('');
		expect(signCellClass(null)).toBe('');
	});
});
