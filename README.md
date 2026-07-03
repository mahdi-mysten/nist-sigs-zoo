# Mysten PQ Signatures Zoo

A Mysten Labs fork of the [PQShield NIST Signatures Zoo](https://github.com/PQShield/nist-sigs-zoo)
(Thom Wiggers) — upstream data CC-BY-4.0.

The fork narrows the general-purpose zoo to the question that matters to us: **which
post-quantum signature scheme should back a Sui PQ authenticator?** Concretely:

- **Signatures only.** The upstream KEM comparison is removed.
- **Curated scheme list.** Only schemes relevant to the decision are kept:
  - FIPS / standards track: ML-DSA, SLH-DSA, Falcon (FN-DSA)
  - NIST on-ramp Round 3 survivors (NIST IR 8610): HAWK, SQIsign, FAEST, MQOM,
    SDitH, UOV, MAYO, QR-UOV, SNOVA
  - Classical baselines: EdDSA, ECDSA
- **Lowest security level only.** For each scheme the data layer keeps just the
  parameter sets at that scheme's lowest NIST level (all genuine variants at that
  level survive — e.g. SLH-DSA s/f × SHA2/SHAKE). See `LOWEST_LEVEL_ONLY` in
  `src/lib/data.ts` to restore the full lists.
- **Sui on-chain lens.** A hero section on the main page compares on-chain footprint
  (pk+sig) and verification time using **our own measured benchmarks** from the
  `pq-bench` crate in our fastcrypto fork (branch `pq-schemes`; median of 1000 verify iterations), with a
  Mac-M2-Max / Sui-validator-server host toggle. Zoo reference rows (i7-12650H,
  rdtsc, upstream's benchmark) are shown for scale only and never enter the
  vs-Ed25519 ratios.


## Development

```sh
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build → dist/
npm run preview   # preview dist/ at http://localhost:4173
npm run check     # type-check
```

## Testing

```sh
npm run test        # unit tests (Vitest) — fast, no browser required
npm run test:e2e    # E2E tests (Playwright) — builds site then runs in headless Chromium
```

Unit tests in `src/lib/__tests__/` cover data processing (including the
lowest-level curation and pq-bench CSV parsing) and URL-encoding logic.
E2E tests in `e2e/` exercise the main page (with the Sui lens) and the advanced
graph page in a real browser.

## Stack

SvelteKit · Svelte 5 · TypeScript · Tailwind CSS v4 · Vega-Lite

## License

Data: [CC BY-SA 4.0](LICENSE.md). Upstream scheme data and benchmark data by
Thom Wiggers / PQShield ([nist-sigs-zoo](https://github.com/PQShield/nist-sigs-zoo),
CC-BY-4.0).
