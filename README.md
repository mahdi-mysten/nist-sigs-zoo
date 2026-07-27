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
- **Every level shown.** The zoo (scatter + sortable table + filters) is the
  exploration view: every parameter set a scheme publishes, at every NIST level —
  ML-DSA-44/65/87, SLH-DSA across 128/192/256, and so on (~113 rows). To re-narrow
  it, see `LOWEST_LEVEL_ONLY` (collapse each scheme to its floor level) and
  `MAX_NIST_LEVEL` (drop levels above a cap) in `src/lib/data.ts`.
- **Sui on-chain lens.** A hero section on the main page is the curated decision
  table — a pinned scheme list, backed by **our own measured benchmarks**, with each
  cell also showing its cost as a ratio against Ed25519:
  - **Verify (server)** — validator-side, measured in Rust through
    [pq-sig-bench](https://github.com/mahdi-mysten/pq-sig-bench) against fastcrypto
    (branch `mahdi/fn-dsa-512`, pre-merge); median of 1000 iterations.
  - **Keygen / Sign (browser)** — wallet-side, measured in TypeScript by
    `scripts/ts-bench.ts` through the libraries a Sui wallet would actually use
    (`@mysten/sui` for Ed25519, `@noble/post-quantum` for the PQ schemes).
  - **Assurance** — whether the implementation is audited, formally verified, or
    only gated on NIST test vectors.

  Both benchmarks are Apple M2 Max; each computes its own intra-run Ed25519 ratios,
  which are never mixed across the two.


## Development

```sh
npm install
npm run dev       # dev server at http://localhost:5173
npm run build     # production build -> dist/
npm run preview   # preview dist/ at http://localhost:4173
npm run check     # type-check
```

## Testing

```sh
npm run test        # unit tests (Vitest) — fast, no browser required
npm run test:e2e    # E2E tests (Playwright) — builds site then runs in headless Chromium
```

Unit tests in `src/lib/__tests__/` cover data processing (parameter-set curation
and the NIST level cap), both benchmark CSV parsers, and URL-encoding logic.
E2E tests in `e2e/` exercise the main page (with the Sui lens) and the advanced
graph page in a real browser.

## Stack

SvelteKit · Svelte 5 · TypeScript · Tailwind CSS v4 · Vega-Lite

## License

Data: [CC BY-SA 4.0](LICENSE.md). Upstream scheme data and benchmark data by
Thom Wiggers / PQShield ([nist-sigs-zoo](https://github.com/PQShield/nist-sigs-zoo),
CC-BY-4.0).
