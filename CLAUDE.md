# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Overview

**Mysten PQ Signatures Zoo** — a Mysten Labs fork of the PQShield NIST Signatures Zoo,
narrowed to the schemes relevant to Sui's PQ-authenticator decision. Signatures only
(the upstream KEM comparison is removed), plus a "Sui on-chain lens" hero backed by our
own measured benchmarks. The page is two views: the **lens** is the curated decision
table (a pinned scheme list, our own Rust + TypeScript measurements), and the **zoo**
below it — scatter + sortable table + filters — is the exploration view showing every
parameter set at every NIST level. The upstream round selector is removed; the dataset
is pinned to the round-3 survivors at their latest specs.
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

- `data.test.ts` — `processYamlSchemes()`: tag filtering, version selection, field computation, flag propagation, parameter-set curation, `withinLevelCap`
- `mystenBench.test.ts` — `parseMystenBenchCsv()` / `aggregateByScheme()`: pq-sig-bench CSV parsing, pending state, per-scheme averaging across implementations
- `filterStore.test.ts` — `buildUrlParams()`: URL encoding of filter state

**Adding unit tests:** create `src/lib/__tests__/<module>.test.ts`. Import directly from `$lib/...`.
Pass mock `SchemeYaml[]` objects to `processYamlSchemes` — no fixture files needed.
Do not import from `$app/*`, `$lib/schemeData`, or `$lib/mystenBenchData` (these need the Vite/SvelteKit runtime).

### E2E tests — `e2e/*.spec.ts`

Playwright against a built static site. The playwright config runs `npm run build && npm run preview -- --port 4175` automatically (`reuseExistingServer: true`, so a running preview server is reused for speed).

- `main.spec.ts` — main page: heading, Sui lens (lean columns, assurance badges, FIPS chips), Vega chart render, advanced link, filter levels, traffic-light shading, table
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

Within those schemes the zoo shows **every parameter set at every NIST level** —
ML-DSA-44/65/87, SLH-DSA across 128/192/256, and so on (~113 rows). Two constants in
`src/lib/data.ts` can re-narrow it: `LOWEST_LEVEL_ONLY` (currently `false`; set true to
collapse each scheme to its floor level via `lowestLevelSets()`) and `MAX_NIST_LEVEL`
(currently `5`, i.e. no cap; lower it to drop higher levels — a scheme whose floor is
above the cap then disappears entirely, Pre-Quantum baselines always pass).
`SELECTABLE_LEVELS` follows `MAX_NIST_LEVEL` and defines the default filter state; the
filter *checkboxes* are narrower still — `FilterPanel` renders only levels some row
actually has, so no dead control appears for NIST category 4, which no curated scheme
targets. The Sui lens hero is independent of all this (it pins its own
`DISPLAY_SCHEMES`).

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
branch, pre-merge — the stack a Sui validator would run. One CSV:
`mac-m2-max.csv` (Apple M2 Max — the only machine class the lens reports; there
is no host toggle). One row per **(scheme, implementation)**; the harness now
benches one implementation per scheme — the one Sui would actually run — except
FN-DSA-1024, which has no fastcrypto implementation yet and is measured via
PQClean's reference C instead. `aggregateByScheme()` still averages when a
scheme has more than one impl row (kept generic — ML-DSA used to be benched
across five implementations and may be again).

Header (must match `MYSTEN_BENCH_HEADER` in `src/lib/mystenBench.ts` and the
pq-sig-bench harness output exactly):

```
scheme,impl,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519
```

`#`-comment lines and blank lines are ignored. Verify medians are over 1000
iterations; keygen/sign over 100. `vs_ed25519` is the harness-computed,
**intra-run** ratio against the Ed25519 row — never recompute it across runs.
Import new runs with `npm run import-bench -- <results.csv>`
(`scripts/import-mysten-bench.js` — validates the header and row count, then
overwrites `data/mysten/mac-m2-max.csv` wholesale): rows carried over from
older runs must be re-appended by hand.

Carried-over rows (currently the four SLH-DSA rows in `mac-m2-max.csv`, from the
earlier pq-bench run) use the impl label `earlier pq-bench run`
(`OLDER_RUN_IMPL` in `src/lib/mystenBench.ts`); their vs_ed25519 is against that
run's own Ed25519 baseline (44375 ns) and is displayed as recorded, without any
visual marker.

Parsing (`parseMystenBenchCsv`) and per-scheme averaging (`aggregateByScheme` —
means over the impls that report a field) live in `src/lib/mystenBench.ts` (pure,
unit-tested); the `import.meta.glob` `?raw` loader is `src/lib/mystenBenchData.ts`.

### TypeScript keygen/sign benchmark — `data/mysten/ts-bench.csv`

The Sui lens's Keygen/Sign columns are a **separate measurement** from the Rust
verify numbers above: validators run Rust, but signing happens client-side in
wallets (browser extensions, mobile apps), which are typically JS/TS — this
benches that stack instead, through the libraries a Sui wallet would actually
use. `scripts/ts-bench.ts` benches all 10 `DISPLAY_SCHEMES`: Ed25519 via
[`@mysten/sui`](https://www.npmjs.com/package/@mysten/sui)
(`Ed25519Keypair.generate()` / `.sign()`, async), the PQ schemes via
[`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum)
(`ml_dsa44/65/87`, `slh_dsa_shake_128s/128f`, `slh_dsa_sha2_128s/128f`,
`falcon512padded`/`falcon1024padded` — the **padded** Falcon variant, matching
the fixed-size wire format `mac-m2-max.csv` already uses). Both libraries are
devDependencies of this repo (not the SvelteKit app's runtime deps — only the
script imports them).

Method mirrors pq-sig-bench: warmup 2, median of N iterations, a fresh random
key every keygen call and a fresh random message under one fixed key every sign
call (ML-DSA and Falcon both use rejection sampling, so a fixed input would
understate their real variance — same reasoning pq-sig-bench documents for its
own sign benchmark). N is 1000 for schemes cheap enough to finish quickly, 100
for the rest, and lower still for the two slowest hash-based schemes
(`SLOW_ITER_CAPS` in the script): 30 for SLH-DSA-SHAKE-128s (~7.5 s/op in pure
JS — no hardware SHA/SHAKE acceleration — so even 100 iterations would take
~12.5 minutes for that scheme alone) and 50 for SLH-DSA-SHA2-128s (~2.2 s/op —
faster than SHAKE, but still slow enough that 100 would push the full run
uncomfortably long). The exact N used is written per row
(`keygen_iters`/`sign_iters`), never assumed — the lens shows it in each cell's
tooltip.

Before timing anything, each scheme's pk/sig byte lengths are checked against
the values already established in `mac-m2-max.csv` (`EXPECTED_SIZES` in the
script) — this is what catches a wrong parameter set or wire variant (e.g.
non-padded Falcon) before its timing gets trusted, mirroring pq-sig-bench's own
self-check-before-timing gate. `checkSizes()` throws its own descriptive error
if a scheme has no `EXPECTED_SIZES` entry at all (rather than a bare
`TypeError`) — a guard for whoever adds an 11th scheme later.

The script also computes `keygen_vs_ed25519`/`sign_vs_ed25519` itself — each
scheme's keygen/sign time divided by this same run's own Ed25519 row — exactly
the same "harness computes its own ratio, UI never recomputes it" rule
`vs_ed25519` already follows in `mac-m2-max.csv`. The two Ed25519 baselines
(this file's vs. `mac-m2-max.csv`'s) are never compared against each other:
Keygen/Sign ratios are intra-`ts-bench.csv`, Verify's ratio is
intra-`mac-m2-max.csv`.

Requires Node ≥22.6 (runs the `.ts` file directly via native TypeScript
support — no build step, no `tsx`/`ts-node`). Re-run: `node scripts/ts-bench.ts`
(writes `data/mysten/ts-bench.csv` directly — no import step, unlike the Rust
harness, since this script runs inside this repo). Parsing lives in
`src/lib/tsBench.ts` (pure, unit-tested); the loader is `src/lib/tsBenchData.ts`.

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
├── mysten/           # measured pq-sig-bench CSV (mac-m2-max) — no other host
└── history.yaml      # chronological event log (attacks, updates, milestones)

src/
├── lib/
│   ├── types.ts          # Scheme, ParameterSet, SchemeYaml, VersionYaml, FilterState types
│   ├── constants.ts      # CPUSPEED, NIST_LEVELS, PENDING_FIPS, SUI_PICK
│   ├── data.ts           # processYamlSchemes() + LOWEST_LEVEL_ONLY + MAX_NIST_LEVEL curation
│   ├── format.ts         # shared cell formatters (fmt, fmtCycles, fmtTime)
│   ├── trafficLight.ts   # size/timing bucket thresholds + Tailwind cell classes (unit-tested)
│   ├── mystenBench.ts    # pq-sig-bench CSV parser + per-scheme impl averaging (pure)
│   ├── mystenBenchData.ts# import.meta.glob ?raw loader → mystenBench
│   ├── tsBench.ts        # ts-bench.ts CSV parser (pure)
│   ├── tsBenchData.ts    # import.meta.glob ?raw loader → tsBench
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
│       ├── SignVsSigPlot.svelte  # Vega-Lite sign-time vs sig-size scatter (measured schemes only)
│       └── SuiLens.svelte        # Sui on-chain lens: 8-column measured table (Scheme·Std·NIST·pk+sig·Keygen·Sign·Verify·Assurance)
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
├── import-mysten-bench.js  # npm run import-bench -- <csv>; header/row validation
└── ts-bench.ts              # node scripts/ts-bench.ts; keygen/sign benchmark → ts-bench.csv

tests/
├── src/lib/__tests__/   # Vitest unit tests (vitest.config.ts)
│   ├── data.test.ts
│   ├── mystenBench.test.ts
│   ├── tsBench.test.ts
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
- After version selection, every parameter set within `MAX_NIST_LEVEL` survives.
  (`lowestLevelSets()` would drop all but the scheme's floor level, but
  `LOWEST_LEVEL_ONLY` is currently `false` — see the curation-rules section.)

### The pick (ML-DSA-65)

`SUI_PICK` in `src/lib/constants.ts` names the parameter set Sui is going with, so
the decision is stated in the UI rather than only in a doc. It's referenced from
three independent render paths, all keyed slightly differently — keep them in sync:
- **Sui lens** (`SuiLens.svelte`) — matches `SUI_PICK.parameterset` against the
  measured/harness row name; renders an apricot row tint, a left border and an
  "Our pick" badge on that row.
- **Zoo scatter** (`ScatterPlot.svelte`) — matches on `(scheme, parameterset)`
  against the YAML row, since the zoo keys rows differently from the lens. Adds an
  `isPick` field, then two final layers (drawn last so they sit on top): an apricot
  halo ring and a text label. Both are `filter`-based, so the annotation disappears
  cleanly if the user filters the pick out rather than floating over nothing.
- **Sign-vs-sig chart** (`SignVsSigPlot.svelte`) — apricot halo plus a bold apricot
  label (see that section's note on why the bold has to be a mark property).

All three use the same apricot accent so they read as one annotation. Changing the
pick means editing `SUI_PICK` and the e2e assertions in `main.spec.ts`.

### Sign-time vs. pk+sig chart

`SignVsSigPlot.svelte`, above the zoo scatter on the main page. Both axes log:
x is the **browser** Sign time from `ts-bench.csv`, y is total on-chain footprint
(`pk + sig`) — the same wallet-cost/chain-cost pair the lens table puts side by
side, with bottom-left being best. Note y is **not** the zoo scatter's sig-only
axis. Deliberately a different dataset from that scatter too: Sign (browser) only
exists for the 10 `DISPLAY_SCHEMES` we benched, not for the ~113 YAML parameter
sets, so **this chart is not driven by the sidebar filters** (the caption says so).
Sizes come from `mac-m2-max.csv`, timings from `ts-bench.csv`, joined by scheme name.

Two gotchas worth knowing before editing it:
- **`align`, `dx`, `dy` and `fontWeight` are Vega-Lite mark properties, not
  encoding channels.** Passing them under `encoding` is silently dropped (it only
  warns to the console, and every label renders identically — which is how the
  pick's bold label was silently a no-op at first). Per-point label styling is
  therefore built as *one layer per distinct style*, each with a
  `filter: {field: 'scheme', oneOf: [...]}` and static mark props.
- Labels are the variant only (`ML-65`, `SHAKE-128s`) since colour+legend already
  give the family; full names are ~2× wider and collide. `labelSlot` then nudges
  one label up and one down for points with **byte-identical** signatures (SHAKE
  vs SHA2 — 7,856 and 17,088), which would otherwise print on top of each other.
  Only exact ties are nudged: an earlier version also spread merely-*close* points,
  which pushed labels on opposite sides of the closeness threshold **toward** each
  other and made ML-87/SHA2-128s collide on phones. Narrow viewports additionally
  get a bottom legend and a smaller label font, mirroring `ScatterPlot`.

### Sui On-Chain Lens

`SuiLens.svelte` on the main page — a deliberately minimal decision table, eight
columns: **Scheme · Std · NIST · pk+sig (B) · Keygen (browser) · Sign (browser) ·
Verify (server) · Assurance**. NIST is the security category (1–5, or N/A for
Ed25519), from the static `MEASURED_LEVEL` map — a fixed property of each set,
not derived from the zoo YAML (which lacks the SHA2 SLH-DSA sets and keys Falcon
by `512`/`1024`). It shows only the FIPS-track schemes we have
measured through fastcrypto; the on-ramp candidates live in the full zoo table
below, not here. Column order follows the signature lifecycle (keygen → sign →
verify), and the header labels say plainly where each op runs: Keygen/Sign are
wallet-side (TypeScript, browser/mobile — see the `ts-bench.csv` section above),
Verify is validator-side (Rust, the server). These are two independent
measurements joined by scheme name; each degrades to `—` on its own if that
scheme is missing from its respective CSV. There is no standalone "vs Ed25519"
column — each of pk+sig/Keygen/Sign/Verify shows its own ratio inline as a
`(X.X×)` suffix right after its value (`ratioSuffix` snippet), sourced from
that column's own CSV (Keygen/Sign from `ts-bench.csv`'s
`keygen_vs_ed25519`/`sign_vs_ed25519`, Verify from `mac-m2-max.csv`'s
`vs_ed25519`) — the two Ed25519 baselines are never mixed. pk+sig's ratio is
the only one computed client-side rather than by a harness: byte lengths are
static, not a noisy measurement, so there's nothing for a harness to own.
- Rows are pinned by `DISPLAY_SCHEMES` (Ed25519, FN-DSA-512, FN-DSA-1024,
  ML-DSA-44, ML-DSA-65, ML-DSA-87, SLH-DSA-SHAKE-128s, SLH-DSA-SHAKE-128f,
  SLH-DSA-SHA2-128s, SLH-DSA-SHA2-128f) — all four SLH-DSA hash-variant/speed
  combinations at level 1.
- Measured rows come from `data/mysten/mac-m2-max.csv`, one row per scheme via
  `aggregateByScheme()`. No host toggle — the lens reports Mac M2 Max only.
- FN-DSA-512 and all three ML-DSA levels are each a single measured
  implementation (fastcrypto; aws-lc-rs) — the `(avg N)` marker and impl-spread
  tooltip only appear if a scheme's CSV rows ever span more than one impl again.
  FN-DSA-1024 has no fastcrypto implementation yet, so it measures PQClean's
  reference C directly — a different codebase than Sui would ship, flagged as
  such in its Assurance pill.
- Every ratio is harness-computed and intra-run — never recomputed by the UI. A
  footnote states the Ed25519 batching caveat (validators batch-verify Ed25519,
  ~2× amortized; no PQ scheme batches — the practical on-chain gap is about 2×
  the Verify column's ratio).
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
