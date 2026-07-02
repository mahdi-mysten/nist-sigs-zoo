# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Overview

**Mysten PQ Signatures Zoo** — a Mysten Labs fork of the PQShield NIST Signatures Zoo,
narrowed to the schemes relevant to Sui's PQ-authenticator decision. Signatures only
(the upstream KEM comparison is removed), each scheme shown at its lowest NIST security
level, plus a "Sui on-chain lens" hero backed by our own measured benchmarks.
Built with SvelteKit (adapter-static) + Tailwind CSS v4 + TypeScript.
Deploy: `npm run build` → `dist/`.

## Stack

- **Framework**: SvelteKit 2 + Svelte 5 (runes mode), adapter-static → `dist/`
- **CSS**: Tailwind CSS v4 via `@tailwindcss/vite`
- **Charts**: Vega-Lite (zoo scatter + Sui lens footprint-vs-verify figure)
- **Language**: TypeScript throughout

## Development

```bash
npm run dev       # dev server at http://localhost:5173
npm run build     # build to dist/
npm run preview   # preview dist/ at http://localhost:4173
npm run check     # type-check with svelte-check
```

## Testing

```bash
npm run test          # unit tests (Vitest, fast, no browser)
npm run test:watch    # unit tests in watch mode
npm run test:e2e      # E2E tests (Playwright, builds site first)
```

### Unit tests — `src/lib/__tests__/*.test.ts`

Vitest with node environment. Tests pure TypeScript functions only — no Svelte components, no browser.

- `data.test.ts` — `processYamlSchemes()`: tag filtering, version selection, field computation, flag propagation, lowest-level curation
- `mystenBench.test.ts` — `parseMystenBenchCsv()` / `computeVerifyRatios()`: pq-bench CSV parsing, pending state, intra-host ratios
- `filterStore.test.ts` — `buildUrlParams()`: URL encoding of filter state

**Adding unit tests:** create `src/lib/__tests__/<module>.test.ts`. Import directly from `$lib/...`.
Pass mock `SchemeYaml[]` objects to `processYamlSchemes` — no fixture files needed.
Do not import from `$app/*`, `$lib/schemeData`, or `$lib/mystenBenchData` (these need the Vite/SvelteKit runtime).

### E2E tests — `e2e/*.spec.ts`

Playwright against a built static site. The playwright config runs `npm run build && npm run preview -- --port 4175` automatically (`reuseExistingServer: true`, so a running preview server is reused for speed).

- `main.spec.ts` — main page: heading, Sui lens (table, host toggle, pending state), Vega chart render, advanced link, round selector, table
- `advanced.spec.ts` — advanced page: axis controls, heading updates, URL encoding/restoration, filter panel

**Adding E2E tests:** add to `e2e/main.spec.ts` or `e2e/advanced.spec.ts`, or create a new `e2e/<feature>.spec.ts`.
Use `page.waitForFunction(() => [...document.querySelectorAll('svg')].some(s => s.querySelector('g')), { timeout: 15_000 })` to wait for a Vega chart to render before asserting on it.
Axis URL params: `x`, `y` (field name), `xs`, `ys` (scale: `log`|`linear`). Default values omitted from URL.

## Data

Source of truth is `data/schemes/*.yaml` — one YAML file per scheme.

### Curation rules (fork-specific)

Only these schemes are kept; do not re-add others without a decision:

- FIPS / standards track: ML-DSA, SLH-DSA, Falcon (FN-DSA)
- NIST on-ramp Round 3 survivors (NIST IR 8610): HAWK, SQIsign, FAEST, MQOM, SDitH, UOV, MAYO, QR-UOV, SNOVA
- Classical baselines: EdDSA, ECDSA

The data layer additionally keeps only each scheme's **lowest** NIST-level parameter
sets (all variants at that level survive). This is `LOWEST_LEVEL_ONLY` +
`lowestLevelSets()` in `src/lib/data.ts`; flip the const to restore full lists.

Schema per file:
```yaml
name: SchemeName
website: https://...
category: Lattice | Multivariate | Hash-based | ...
assumption: ...
versions:
  - version: "FIPS 206"        # human-readable version label
    date: "2024-08-13"         # ISO date, used to pick latest
    status: Standardized | On-ramp
    tags: [round-2]            # round-1, round-2, round-3, or omit for reference/standardized schemes
                               # post-round-3 updates should have NO tags
    broken: false              # or string description / "classical"
    warning: false             # or string description
    info: false                # or string description
    parametersets:
      - name: ML-DSA-44
        level: 2               # 1-5 or "Pre-Quantum"
        pk: 1312
        sig: 2420
        signing_cycles: 1234567
        verification_cycles: 234567
        signing_us: null       # microseconds; use cycles OR us, not both
        verification_us: null
        notes: null
```

Security flags (`broken`/`warning`/`info`) can be set at version level (applies to all
parametersets) or overridden per-parameterset.

The YAML files are bundled at build time via a Vite plugin (`vite.config.ts`) and
`import.meta.glob` in `src/lib/schemeData.ts`.

### Mysten measured benchmarks — `data/mysten/*.csv`

Our own pq-bench runs (sui-pq repo, `sui/benchmark`), one CSV per host:
`mac-m2-max.csv` (Apple M2 Max) and `server.csv` (Sui-validator-class server;
header-only placeholder until the server run is imported).

Header (must match `MYSTEN_BENCH_HEADER` in `src/lib/mystenBench.ts` and the sui-pq
harness output exactly):

```
name,family,security_level,std,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519
```

`#`-comment lines and blank lines are ignored. Verify medians are over 1000
iterations; keygen/sign over 100. Import new runs with
`npm run import-bench -- <results.csv> <mac-m2-max|server>`
(`scripts/import-mysten-bench.js` — validates the header and row count, then writes
`data/mysten/<host>.csv`). Server flow: run sui-pq's `sui/benchmark/run-on-server.sh`
on the server, scp `results-<label>.csv` over, import with host `server`.

Parsing (`parseMystenBenchCsv`) and ratio derivation (`computeVerifyRatios`) live in
`src/lib/mystenBench.ts` (pure, unit-tested); the `import.meta.glob` `?raw` loader is
`src/lib/mystenBenchData.ts`. Ratios are always computed against the same host's own
Ed25519 row — never cross-host.

### History

`data/history.yaml` — chronological log of notable events shown in the site's history panel.
**Update this file whenever scheme data changes** (spec updates, new attacks, milestone events).

```yaml
- date: '2026-05-26'          # ISO date
  type: update                 # update | attack | milestone
  description: "HTML string. Link tags allowed."
  schemes: [SNOVA]             # optional; list of affected scheme names
```

Types: `update` (spec/data change), `attack` (new cryptanalysis result), `milestone` (NIST process event).
Entries may reference schemes that were pruned from `data/schemes/` — the timeline is
history, not the curated list.

## Architecture

```
data/
├── schemes/          # one .yaml per curated signature scheme (source of truth)
├── mysten/           # measured pq-bench CSVs per host (mac-m2-max, server)
└── history.yaml      # chronological event log (attacks, updates, milestones)

src/
├── lib/
│   ├── types.ts          # Scheme, ParameterSet, SchemeYaml, VersionYaml, FilterState types
│   ├── constants.ts      # CPUSPEED, NIST_LEVELS
│   ├── data.ts           # processYamlSchemes() + LOWEST_LEVEL_ONLY curation
│   ├── mystenBench.ts    # pq-bench CSV parser + intra-host verify ratios (pure)
│   ├── mystenBenchData.ts# import.meta.glob ?raw loader → mystenBench[host]
│   ├── filterStore.ts    # Svelte writable store + derived filteredRows + URL codec
│   ├── roundStore.ts     # writable<'round-1'|'round-2'|'round-3'|'latest'> — drives dataset selection
│   ├── schemeData.ts     # import.meta.glob loader → allSchemeData: SchemeYaml[]
│   ├── themeStore.ts     # dark/light/system theme store → localStorage
│   ├── yaml.d.ts         # TypeScript module declaration for *.yaml imports
│   └── components/
│       ├── SecurityBadge.svelte  # broken/warning/info badges with aria-labels
│       ├── FilterPanel.svelte    # filter controls (categories, levels, ranges)
│       ├── RangeField.svelte     # reusable number input
│       ├── SchemeTable.svelte    # sortable table (one row per parameter set)
│       ├── ScatterPlot.svelte    # Vega-Lite scatter plot; accepts xField/yField/xScale/yScale props
│       ├── SuiLens.svelte        # Sui on-chain lens: host toggle, measured+reference table, note
│       └── SuiLensPlot.svelte    # Vega-Lite pk+sig vs verify-µs scatter (points prop)
└── routes/
    ├── +layout.svelte    # nav (Mysten branding, round selector, History link, dark toggle), footer
    ├── +page.ts          # load: processYamlSchemes('round-3', {useLatestVersion:true}), createFilterStore
    ├── +page.svelte      # SuiLens hero, page composition, round switching, URL state sync
    ├── advanced/
    │   ├── +page.ts      # same load as main page
    │   └── +page.svelte  # axis selectors, scale toggles, ScatterPlot, FilterPanel, SchemeTable
    └── history/
        ├── +page.ts      # loads data/history.yaml
        └── +page.svelte  # timeline

scripts/
└── import-mysten-bench.js  # npm run import-bench -- <csv> <host>; header/row validation

tests/
├── src/lib/__tests__/   # Vitest unit tests (vitest.config.ts)
│   ├── data.test.ts
│   ├── mystenBench.test.ts
│   └── filterStore.test.ts
└── e2e/                 # Playwright E2E tests (playwright.config.ts)
    ├── main.spec.ts
    └── advanced.spec.ts
```

### Data Processing

`processYamlSchemes(allSchemeData, tagFilter?)` in `src/lib/data.ts`:
- With `tagFilter` (e.g. `'round-2'`): picks the latest version whose `tags` includes that value.
- Fallback: schemes with no tags on any version are always included (reference schemes like ML-DSA).
- Schemes that have tags but none matching `tagFilter` are excluded.
- After version selection, `lowestLevelSets()` drops every parameter set above the
  scheme's lowest NIST level (when `LOWEST_LEVEL_ONLY` is true).

### Sui On-Chain Lens

`SuiLens.svelte` on the main page, independent of the round selector:
- Measured rows come from `data/mysten/mac-m2-max.csv`; the host toggle only swaps
  which host's run feeds the verify/ratio columns (sizes are host-independent).
- vs-Ed25519 ratios come from `computeVerifyRatios()` on the selected host's rows —
  each host is compared against its own Ed25519 baseline.
- When the selected host's CSV has no data rows (server placeholder), verify/ratio
  cells render as "pending" with a pointer to `npm run import-bench`.
- Zoo reference rows (HAWK-512, MAYO-one, UOV-Is-pkc, SQIsign-I, FAEST-128s) are
  resolved from the curated YAML via `ZOO_REFERENCE_SETS`; their timings are
  upstream's i7-12650H rdtsc bench, so they are display-only and never enter ratios.

### Filter Store

`src/lib/filterStore.ts` uses stable module-level store references. `_store` and `_filteredRows`
are created once; `createFilterStore()` on subsequent calls (round changes) updates `_allRows`
and resets `_store` in place. This means components calling `getFilterStore()` at init always
hold valid references — no stale subscription bugs.

Category checkbox state is **derived** from the scheme set, not stored separately.

URL state: filter params encoded as query params, applied client-side in `onMount`.
Round encoded as `?r=1` for round-1, `?r=2` for round-2. No param = latest (default).

### Round Selector

Nav shows Latest / Round 3 / Round 2 / Round 1 toggle (only on home page). Clicking updates
`roundStore`, which triggers `applyRound()` in `+page.svelte`, which calls `createFilterStore()`
with new data. The Sui lens is unaffected by round changes.

### Latest View

"Latest" (default) and "Round 3" both use `tagFilter='round-3'` with `useLatestVersion=true`.
Inclusion: scheme must have at least one version tagged `round-3` (or be an untagged reference
scheme). Data shown: `sorted[0]` (newest version by date, regardless of tags).

Round 2 view uses `tagFilter='round-2'` without `useLatestVersion` — shows the pinned
round-2 submission version.

Post-round-3 spec updates should be added as new version entries **without** any tags. This way:
- Round 2/3 views show pinned submission data.
- Latest view shows the most current specs.

### Performance Data

Cycles extrapolated from ms values use `CPUSPEED = 2_500_000_000` (2.5 GHz).
Extrapolated values shown with wavy red underline (`decoration-wavy decoration-red-500`).

## Deploy

GitHub Actions workflow at `.github/workflows/deploy.yml`:
1. `npm ci && npm run build` → `dist/`
2. Copy `round-1/` into `dist/round-1/` (untouched static snapshot)
3. Copy `.nojekyll` into `dist/`
4. Deploy `dist/` to GitHub Pages

## round-1/

Contains a standalone snapshot of round-1 data. **Do not modify.** Served at `/round-1/`.

## bench/

Upstream's C benchmark harness (dlopen shims per scheme, rdpmc/rdtsc cycle counting).
Kept for reference; the Sui lens uses the sui-pq pq-bench numbers instead. See
`bench/CLAUDE.md`.
