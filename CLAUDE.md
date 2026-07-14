# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Overview

**Mysten PQ Signatures Zoo** — a Mysten Labs fork of the PQShield NIST Signatures Zoo,
narrowed to the schemes relevant to Sui's PQ-authenticator decision. Signatures only
(the upstream KEM comparison is removed), each scheme shown at its lowest NIST security
level and only at levels 1–2, plus a "Sui on-chain lens" hero backed by our own
measured benchmarks. The upstream round selector is removed; the dataset is pinned to
the round-3 survivors at their latest specs.
Built with SvelteKit (adapter-static) + Tailwind CSS v4 + TypeScript.
Deploy: `npm run build` → `dist/`.

## Stack

- **Framework**: SvelteKit 2 + Svelte 5 (runes mode), adapter-static → `dist/`
- **CSS**: Tailwind CSS v4 via `@tailwindcss/vite`
- **Charts**: Vega-Lite (zoo scatter on the main + advanced pages)
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
- `mystenBench.test.ts` — `parseMystenBenchCsv()` / `aggregateByScheme()`: pq-sig-bench CSV parsing, pending state, per-scheme averaging across implementations
- `filterStore.test.ts` — `buildUrlParams()`: URL encoding of filter state

**Adding unit tests:** create `src/lib/__tests__/<module>.test.ts`. Import directly from `$lib/...`.
Pass mock `SchemeYaml[]` objects to `processYamlSchemes` — no fixture files needed.
Do not import from `$app/*`, `$lib/schemeData`, or `$lib/mystenBenchData` (these need the Vite/SvelteKit runtime).

### E2E tests — `e2e/*.spec.ts`

Playwright against a built static site. The playwright config runs `npm run build && npm run preview -- --port 4175` automatically (`reuseExistingServer: true`, so a running preview server is reused for speed).

- `main.spec.ts` — main page: heading, Sui lens (lean columns, host toggle, pending state, assurance badges, FIPS chips), Vega chart render, advanced link, filter levels, traffic-light shading, table
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
Stacked on top, `MAX_NIST_LEVEL = 2` drops every set above level 2 (Pre-Quantum
baselines always pass) — a scheme whose floor is level 3+ disappears entirely.
Raise the const to widen; the filter checkboxes follow via `SELECTABLE_LEVELS`.

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

Our own runs of the [pq-sig-bench](https://github.com/mahdi-mysten/pq-sig-bench)
harness, measured **through fastcrypto** — currently the
[`mahdi/fn-dsa-512`](https://github.com/MystenLabs/fastcrypto/tree/mahdi/fn-dsa-512)
branch, pre-merge — the stack a Sui validator would run. One CSV per host:
`mac-m2-max.csv` (Apple M2 Max) and `server.csv` (Sui-validator-class server;
header-only placeholder until the server run is imported). One row per
**(scheme, implementation)**; the harness now benches one implementation per
scheme — the one Sui would actually run — except FN-DSA-1024, which has no
fastcrypto implementation yet and is measured via PQClean's reference C instead.
`aggregateByScheme()` still averages when a scheme has more than one impl row
(kept generic — ML-DSA used to be benched across five implementations and may
be again).

Header (must match `MYSTEN_BENCH_HEADER` in `src/lib/mystenBench.ts` and the
pq-sig-bench harness output exactly):

```
scheme,impl,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519
```

`#`-comment lines and blank lines are ignored. Verify medians are over 1000
iterations; keygen/sign over 100. `vs_ed25519` is the harness-computed,
**intra-run** ratio against the Ed25519 row — never recompute it across runs or
hosts. Import new runs with `npm run import-bench -- <results.csv> <mac-m2-max|server>`
(`scripts/import-mysten-bench.js` — validates the header and row count, then writes
`data/mysten/<host>.csv`). Importing overwrites the host file: rows carried over
from older runs must be re-appended by hand.

Carried-over rows (currently the four SLH-DSA rows in `mac-m2-max.csv`, from the
earlier pq-bench run) use the impl label `earlier pq-bench run`
(`OLDER_RUN_IMPL` in `src/lib/mystenBench.ts`); their vs_ed25519 is against that
run's own Ed25519 baseline (44375 ns) and is displayed as recorded, without any
visual marker.

Parsing (`parseMystenBenchCsv`) and per-scheme averaging (`aggregateByScheme` —
means over the impls that report a field) live in `src/lib/mystenBench.ts` (pure,
unit-tested); the `import.meta.glob` `?raw` loader is `src/lib/mystenBenchData.ts`.

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
│   ├── constants.ts      # CPUSPEED, NIST_LEVELS, PENDING_FIPS
│   ├── data.ts           # processYamlSchemes() + LOWEST_LEVEL_ONLY + MAX_NIST_LEVEL curation
│   ├── format.ts         # shared cell formatters (fmt, fmtCycles, fmtTime)
│   ├── trafficLight.ts   # size/timing bucket thresholds + Tailwind cell classes (unit-tested)
│   ├── mystenBench.ts    # pq-sig-bench CSV parser + per-scheme impl averaging (pure)
│   ├── mystenBenchData.ts# import.meta.glob ?raw loader → mystenBench[host]
│   ├── suiNotes.ts       # per-scheme implementation-assurance badges for the lens
│   ├── filterStore.ts    # Svelte writable store + derived filteredRows + URL codec
│   ├── schemeData.ts     # import.meta.glob loader → allSchemeData: SchemeYaml[]
│   ├── themeStore.ts     # dark/light/system theme store → localStorage
│   ├── yaml.d.ts         # TypeScript module declaration for *.yaml imports
│   └── components/
│       ├── SecurityBadge.svelte  # broken/warning/info badges with aria-labels
│       ├── FilterPanel.svelte    # filter controls (categories, levels, ranges)
│       ├── RangeField.svelte     # reusable number input
│       ├── SchemeTable.svelte    # sortable table (one row per parameter set)
│       ├── ScatterPlot.svelte    # Vega-Lite scatter plot; accepts xField/yField/xScale/yScale props
│       └── SuiLens.svelte        # Sui on-chain lens: lean 6-column measured table (Scheme·Std·pk+sig·Verify·vs Ed25519·Assurance)
└── routes/
    ├── +layout.svelte    # nav (Mysten branding, History link, dark toggle), footer
    ├── +page.ts          # load: processYamlSchemes('round-3', {useLatestVersion:true}), createFilterStore
    ├── +page.svelte      # SuiLens hero, page composition, URL state sync
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

`SuiLens.svelte` on the main page — a deliberately minimal decision table, six
columns: **Scheme · Std · pk+sig (B) · Verify · vs Ed25519 · Assurance**. It shows
only the FIPS-track schemes we have measured through fastcrypto; the on-ramp
candidates live in the full zoo table below, not here.
- Rows are pinned by `DISPLAY_SCHEMES` (Ed25519, FN-DSA-512, FN-DSA-1024,
  ML-DSA-44, ML-DSA-65, ML-DSA-87, SLH-DSA-SHAKE-128s, SLH-DSA-SHAKE-128f). The
  CSV still carries the SLH-DSA SHA2 variants; they're just not in this view.
- Measured rows come from `data/mysten/mac-m2-max.csv`, one row per scheme via
  `aggregateByScheme()`; the host toggle only swaps which host's run feeds the
  verify/ratio columns (sizes are host-independent). Server placeholder → those
  cells render "pending" with a pointer to `npm run import-bench`.
- FN-DSA-512 and all three ML-DSA levels are each a single measured
  implementation (fastcrypto; aws-lc-rs) — the `(avg N)` marker and impl-spread
  tooltip only appear if a scheme's CSV rows ever span more than one impl again.
  FN-DSA-1024 has no fastcrypto implementation yet, so it measures PQClean's
  reference C directly — a different codebase than Sui would ship, flagged as
  such in its Assurance pill.
- vs-Ed25519 ratios are the harness's own intra-run `vs_ed25519` column — never
  recomputed. A footnote states the Ed25519 batching caveat (validators batch-verify
  Ed25519, ~2× amortized; no PQ scheme batches).
- Std chips name the concrete standard: "FIPS 204"/"FIPS 205" from the picked
  version's label (`fipsChipLabel` in `$lib/format`), and "FIPS 206 pending" for
  Falcon via `PENDING_FIPS` in `$lib/constants` (same in `SchemeTable`).
- The **Assurance** column (`src/lib/suiNotes.ts`) is the practical "can we trust
  the code" axis: one colored pill per scheme — green (`strong`: audited / formally
  verified) or amber (`mid`: correctness-gated but unaudited, or not the
  implementation Sui would ship) — with a muted "unaudited" suffix where no
  independent audit exists, and the term explained in the pill's tooltip.
  Ed25519 = Audited; FN-DSA-512 = KAT-gated (Round-3 KATs + PQClean cross-verify);
  FN-DSA-1024 = Reference impl (PQClean C, no fastcrypto impl yet); ML-DSA-44/65/87
  = Formally verified (aws-lc-rs delegates to mldsa-native's CBMC + HOL Light
  proofs); SLH-DSA = ACVP-gated.

### Filter Store

`src/lib/filterStore.ts` uses stable module-level store references. `_store` and `_filteredRows`
are created once; `createFilterStore()` on subsequent calls (page navigations) updates `_allRows`
and resets `_store` in place. This means components calling `getFilterStore()` at init always
hold valid references — no stale subscription bugs.

Category checkbox state is **derived** from the scheme set, not stored separately.

URL state: filter params encoded as query params, applied client-side in `onMount`.

### Dataset (pinned)

The round selector is gone. Both pages use `tagFilter='round-3'` with `useLatestVersion=true`.
Inclusion: scheme must have at least one version tagged `round-3` (or be an untagged reference
scheme). Data shown: `sorted[0]` (newest version by date, regardless of tags).

Post-round-3 spec updates should be added as new version entries **without** any tags so the
pinned view keeps showing the most current specs.

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
