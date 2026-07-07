// Qualitative decision factors for the Sui lens "Details" column, as compact
// flags: green = strength, amber = caveat, red = risk. Performance alone
// doesn't pick an authenticator — implementation risk, ecosystem assurance
// (audits, formal verification, FIPS validation) and assumption maturity weigh
// just as much. The flag label is the scannable claim; the tooltip carries the
// specifics, verified against primary sources (NIST IR 8610 May 2026, FIPS 206
// status updates, crate repos/audit statements) as of 2026-07.
// Keyed by measured scheme name first, then by zoo scheme name for the
// reference rows.
export interface SuiFlag {
	label: string;
	kind: 'good' | 'warn' | 'bad';
	tip?: string;
}

export const SUI_NOTES: Record<string, SuiFlag[]> = {
	Ed25519: [
		{ label: 'Battle-tested', kind: 'good', tip: 'Production baseline: universal wallet and hardware support.' },
		{ label: 'Batch verify', kind: 'good', tip: 'Sui validators batch-verify Ed25519, roughly halving the amortized per-signature cost. No PQ candidate can batch.' },
		{ label: 'Not PQ', kind: 'bad', tip: 'No quantum resistance — this is the scheme the PQ migration replaces.' },
	],
	'FN-DSA-512': [
		{ label: '1.6 KB on-chain', kind: 'good', tip: 'Smallest FIPS-track footprint: 897 B pk + 666 B sig.' },
		{ label: 'Fastest PQ verify', kind: 'good', tip: 'Verification is integer-only NTT — no floating point, so none of the signing risk reaches validators. 13.2 µs (0.47× Ed25519) in our fastcrypto bench.' },
		{ label: 'Mainnet precedent', kind: 'good', tip: 'Algorand has run Falcon verification on mainnet since 2024.' },
		{ label: 'Hard to sign safely', kind: 'bad', tip: 'NIST itself calls FN-DSA “difficult to implement”: signing needs a constant-time floating-point Gaussian sampler, with demonstrated key-recovery side channels (FALCON Down et al.) — wallet-side risk.' },
		{ label: 'No audits', kind: 'bad', tip: 'No audited implementation in any language; the best Rust signer (Falcon co-author Pornin’s fn-dsa crate) is pre-standard and unaudited.' },
		{ label: 'FIPS 206 unpublished', kind: 'bad', tip: 'Draft still unpublished as of 2026-07 (final ~2027+), and the final wire format will differ from today’s Falcon — shipping early means a planned migration.' },
	],
	'ML-DSA-44': [
		{ label: 'FIPS 204 final', kind: 'good', tip: 'Final since Aug 2024 — NIST’s primary post-quantum signature standard.' },
		{ label: 'Rust ecosystem', kind: 'good', tip: 'Independent implementations from respected parties: aws-lc-rs (AWS; FIPS module with ML-DSA in CMVP review), libcrux (Cryspen, partially formally verified), RustCrypto, fips204.' },
		{ label: 'Constant-time friendly', kind: 'good', tip: 'Integer-only with uniform sampling — no floating point, no Gaussians.' },
		{ label: '3.7 KB on-chain', kind: 'bad', tip: 'Biggest footprint of the lattice options: 1,312 B pk + 2,420 B sig per tx.' },
	],
	'SLH-DSA-SHAKE-128s': [
		{ label: 'FIPS 205 final', kind: 'good', tip: 'Final since Aug 2024.' },
		{ label: 'Hash-only assumptions', kind: 'good', tip: 'The conservative fallback: stateless, security rests on hash functions alone; level-1 sets untouched by any attack.' },
		{ label: '7.9 KB sig', kind: 'bad' },
		{ label: '~1 s sign', kind: 'bad' },
		{ label: '~1 ms verify', kind: 'bad' },
		{ label: 'No audited Rust', kind: 'warn', tip: 'RustCrypto slh-dsa and integritychain fips205 both exist but neither is independently audited.' },
	],
	'SLH-DSA-SHAKE-128f': [
		{ label: 'FIPS 205 final', kind: 'good' },
		{ label: 'Hash-only assumptions', kind: 'good', tip: 'Stateless; security rests on hash functions alone.' },
		{ label: '20× faster sign', kind: 'good', tip: '~48 ms vs ~1 s for the s variant.' },
		{ label: '17 KB sig', kind: 'bad' },
		{ label: '~2.8 ms verify', kind: 'bad' },
	],
	'SLH-DSA-SHA2-128s': [
		{ label: 'FIPS 205 final', kind: 'good' },
		{ label: 'Hash-only assumptions', kind: 'good', tip: 'Stateless; security rests on hash functions alone.' },
		{ label: 'SHA-2 ~20% faster', kind: 'good', tip: 'The SHA-2 pipeline outruns SHAKE across keygen/sign/verify on our host.' },
		{ label: '7.9 KB sig', kind: 'bad' },
		{ label: '~0.8 s sign', kind: 'bad' },
	],
	'SLH-DSA-SHA2-128f': [
		{ label: 'FIPS 205 final', kind: 'good' },
		{ label: 'Hash-only assumptions', kind: 'good', tip: 'Stateless; security rests on hash functions alone.' },
		{ label: 'Fastest SLH sign', kind: 'good', tip: '~38 ms — the cheapest signing among the SLH-DSA level-1 sets.' },
		{ label: '17 KB sig', kind: 'bad' },
		{ label: '~2.2 ms verify', kind: 'bad' },
	],
	// Zoo reference rows (keyed by zoo scheme name).
	'SLH-DSA': [
		{ label: 'FIPS 205 final', kind: 'good' },
		{ label: 'Hash-only assumptions', kind: 'good', tip: 'The conservative fallback: stateless, security rests on hash functions alone.' },
		{ label: 'Multi-KB sigs', kind: 'bad' },
		{ label: 'ms-scale verify', kind: 'bad' },
	],
	HAWK: [
		{ label: 'Falcon sizes, no FP', kind: 'good', tip: '1,024 B pk + 555 B sig with integer-only signing — sidesteps Falcon’s floating-point sampler risk; fast verify.' },
		{ label: 'Young assumption', kind: 'bad', tip: 'module-LIP is only ~4 years old (Asiacrypt 2022). Eurocrypt ’24/’25 attacks hit nearby variants; HAWK’s parameters unaffected so far.' },
		{ label: 'No Rust impl', kind: 'bad', tip: 'No production or audited Rust implementation; absent from liboqs and PQClean.' },
		{ label: 'Std ≥2028', kind: 'warn', tip: 'On-ramp Round 3 (NIST IR 8610, May 2026); the round is expected to last ~2 years.' },
	],
	MAYO: [
		{ label: '1.9 KB on-chain', kind: 'good', tip: '1,420 B pk + 454 B sig.' },
		{ label: 'Fast verify', kind: 'good', tip: 'Roughly at parity with Ed25519 on the zoo’s own i7 baseline.' },
		{ label: '143 KB expanded pk', kind: 'warn', tip: 'The verifier expands the compact pk to ~143 KB in memory.' },
		{ label: 'Attack pressure', kind: 'bad', tip: 'Novel “whipped” Oil-and-Vinegar design: MAYO₂ fell ~30 bits in 2025; a 2026 MQ attack trimmed MAYO₁ to ~2^145 (still above Level 1).' },
		{ label: 'Std uncertain', kind: 'bad', tip: 'NIST says it is unlikely to standardize multivariate schemes without a further evaluation round.' },
	],
	UOV: [
		{ label: '27 yr unbroken', kind: 'good', tip: 'Best-studied multivariate design — no structural break since 1999.' },
		{ label: '96 B sig, fast verify', kind: 'good' },
		{ label: '66.6 KB pk', kind: 'bad', tip: 'Expands to 412 KB in the verifier — prohibitive on-chain unless keys are stored once and referenced.' },
		{ label: 'Margins trimmed', kind: 'warn', tip: '2025–26 attacks cut the Is sets to ~159 bits — still above Level 1, flagged as a warning.' },
		{ label: 'Rust via FFI only', kind: 'bad', tip: 'Only credible path is the oqs crate (liboqs FFI); no production pure-Rust implementation.' },
	],
	SQIsign: [
		{ label: '213 B on-chain', kind: 'good', tip: 'Smallest pk+sig of any candidate: 65 B pk + 148 B sig — ~2.2× Ed25519’s bytes (NIST IR 8610).' },
		{ label: 'Rust verifier exists', kind: 'good', tip: 'Anchorage’s pure-Rust sqisign-rs verifies the standard level-1 format, KAT-verified (unaudited). Unaffected by the 2022 SIKE break.' },
		{ label: 'ms-scale verify', kind: 'bad', tip: '3.5 ms on the zoo bench (v2.0.1 spec), ~1.5 ms with the best assembly implementation — orders of magnitude above Ed25519 at validator throughput.' },
		{ label: 'Novel assumptions', kind: 'bad', tip: 'NIST calls the security assumptions “relatively novel”; fully constant-time signing is still an open item.' },
		{ label: 'Std ≥2028', kind: 'warn', tip: 'On-ramp Round 3; the round is expected to last ~2 years.' },
	],
	FAEST: [
		{ label: 'AES-only assumptions', kind: 'good', tip: 'VOLE-in-the-Head proof of an AES key — SLH-DSA-grade conservatism from symmetric primitives alone.' },
		{ label: '4.5 KB sig', kind: 'good', tip: 'Smaller than SLH-DSA at the same conservative-assumption tier.' },
		{ label: '~3–4 ms verify', kind: 'bad', tip: '128s; the 128f variant verifies in ~0.5 ms but signs 5.9 KB signatures.' },
		{ label: 'Young design', kind: 'bad', tip: 'First published 2023; a pure-Rust crate exists (AIT, explicitly unaudited).' },
		{ label: 'Std ≥2028', kind: 'warn', tip: 'On-ramp Round 3; the round is expected to last ~2 years.' },
	],
};

// Measured rows are keyed by their full measured name; reference rows fall back
// to the zoo scheme name.
export function suiNoteFor(key: string, schemeFallback?: string): SuiFlag[] | undefined {
	return SUI_NOTES[key] ?? (schemeFallback ? SUI_NOTES[schemeFallback] : undefined);
}
