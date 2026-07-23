<script lang="ts">
	import { DISPLAY_SCHEMES, PENDING_FIPS, SUI_PICK } from '$lib/constants';
	import { fipsChipLabel, fmt, fmtTime } from '$lib/format';
	import { processYamlSchemes } from '$lib/data';
	import { allSchemeData } from '$lib/schemeData';
	import { aggregateByScheme, type MystenSchemeAgg } from '$lib/mystenBench';
	import { mystenBench, BENCH_MACHINE } from '$lib/mystenBenchData';
	import { tsBench } from '$lib/tsBenchData';
	import { suiAssuranceFor, type SuiAssurance } from '$lib/suiNotes';
	import { signCellClass, sizeCellClass, verifyCellClass } from '$lib/trafficLight';
	import type { Scheme } from '$lib/types';
	import SecurityBadge from './SecurityBadge.svelte';

	// pq-sig-bench benches one implementation per row: the one Sui would actually
	// run. aggregateByScheme() collapses to one row per scheme, which is a no-op
	// today but keeps this forward-compatible if a scheme is ever multi-impl again
	// (ML-DSA used to be, see the harness README's background section).
	const aggs = aggregateByScheme(mystenBench);
	const mystenByScheme = new Map(aggs.map((a) => [a.scheme, a]));

	// pk+sig ratio baseline: same Ed25519-row-of-this-CSV rule as the timing
	// ratios, just computed here since mac-m2-max.csv has no vs_ed25519 column
	// for sizes (they're static byte lengths, not a noisy measurement, so
	// there's nothing for the harness itself to compute and own).
	const ed25519PkPlusSig = (() => {
		const ed = mystenByScheme.get('Ed25519');
		return ed ? ed.pkLen + ed.sigLen : null;
	})();

	// Keygen/Sign are a separate measurement (scripts/ts-bench.ts, TypeScript via
	// @mysten/sui / @noble/post-quantum: the libraries a Sui wallet would use):
	// joined onto the Rust-measured rows by scheme name.
	const tsByScheme = new Map(tsBench.map((r) => [r.scheme, r]));

	// A scheme renders as long as EITHER source has it: Verify degrades to "—" if
	// missing from mac-m2-max.csv, Keygen/Sign degrade to "—" if missing from
	// ts-bench.csv, symmetrically. Only a scheme absent from both (impossible
	// today, but not enforced by types) drops out entirely.
	interface LensRow {
		scheme: string;
		mysten?: MystenSchemeAgg;
		ts?: (typeof tsBench)[number];
	}
	const measuredRows: LensRow[] = DISPLAY_SCHEMES.map((scheme) => ({
		scheme,
		mysten: mystenByScheme.get(scheme),
		ts: tsByScheme.get(scheme),
	})).filter((r) => r.mysten != null || r.ts != null);

	const { schemes } = processYamlSchemes(allSchemeData, 'round-3', { useLatestVersion: true });

	// Measured rows are keyed by the harness scheme name; map to the zoo scheme for
	// the Std chip (FIPS number) and the security badge.
	const MEASURED_SCHEME: Record<string, string> = {
		Ed25519: 'EdDSA',
		'FN-DSA-512': 'Falcon',
		'FN-DSA-1024': 'Falcon',
		'ML-DSA-44': 'ML-DSA',
		'ML-DSA-65': 'ML-DSA',
		'ML-DSA-87': 'ML-DSA',
		'SLH-DSA-SHAKE-128s': 'SLH-DSA',
		'SLH-DSA-SHAKE-128f': 'SLH-DSA',
		'SLH-DSA-SHA2-128s': 'SLH-DSA',
		'SLH-DSA-SHA2-128f': 'SLH-DSA',
	};
	function zooSchemeFor(name: string): Scheme | undefined {
		const mapped = MEASURED_SCHEME[name];
		return schemes.find((s) => s.scheme === mapped);
	}

	// NIST post-quantum security category per measured parameter set — a fixed
	// property of each set. Kept as a static map rather than derived from the zoo
	// YAML because that lists SLH-DSA's SHAKE sets only (not the SHA2 rows we show
	// here) and keys Falcon by '512'/'1024' rather than the FN-DSA-* names.
	const MEASURED_LEVEL: Record<string, number | 'N/A'> = {
		Ed25519: 'N/A',
		'FN-DSA-512': 1,
		'FN-DSA-1024': 5,
		'ML-DSA-44': 2,
		'ML-DSA-65': 3,
		'ML-DSA-87': 5,
		'SLH-DSA-SHAKE-128s': 1,
		'SLH-DSA-SHAKE-128f': 1,
		'SLH-DSA-SHA2-128s': 1,
		'SLH-DSA-SHA2-128f': 1,
	};

	function fmtRatio(r: number): string {
		return r.toFixed(1) + '×';
	}

	// Assurance-pill palette by tier: green for audited/proven, amber for
	// correctness-gated-but-unaudited.
	const TIER_CLASS: Record<SuiAssurance['tier'], string> = {
		strong: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
		mid: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
	};

	// Tooltip body listing the per-implementation numbers behind an averaged cell.
	function implSpread(row: MystenSchemeAgg): string {
		return row.impls
			.filter((r) => r.verifyNs != null)
			.map((r) => `${r.impl}: ${fmtTime((r.verifyNs as number) / 1000)}`)
			.join(' · ');
	}
</script>

<!-- Std chip: names the concrete standard ("FIPS 204") from the version label, or
     the pending FIPS number (Falcon → "FIPS 206 pending") from PENDING_FIPS. -->
{#snippet stdCell(scheme: Scheme | undefined)}
	<td class="whitespace-nowrap px-3 py-1.5">
		{#if scheme?.status === 'FIPS'}
			<span class="rounded bg-pqs-apricot/20 px-1.5 py-0.5 text-xs font-semibold text-pqs-apricot">{fipsChipLabel(scheme.version)}</span>
		{:else if scheme?.status === 'To be standardized'}
			<span class="rounded bg-pqs-steel/10 px-1.5 py-0.5 text-xs font-semibold text-pqs-steel dark:text-pqs-bluegray">
				{PENDING_FIPS[scheme.scheme] ? `${PENDING_FIPS[scheme.scheme]} pending` : 'Std pending'}
			</span>
		{:else if scheme?.status === 'Classic cryptography'}
			<span class="text-pqs-steel/70 dark:text-pqs-bluegray/70">Classic</span>
		{:else}
			<span class="text-pqs-steel/70 dark:text-pqs-bluegray/70">{scheme?.status ?? '—'}</span>
		{/if}
	</td>
{/snippet}

<!-- "(X.X×)" suffix vs the Ed25519 baseline, shared by pk+sig/Keygen/Sign/Verify:
     each column's ratio is intra-run against its own CSV's own Ed25519 row
     (ts-bench.csv for Keygen/Sign, mac-m2-max.csv for pk+sig/Verify), never
     cross-CSV. text-pqs-steel/dark:text-pqs-bluegray (not the reverse: that
     pairing is unreadably low-contrast in both themes) plus font-medium keeps
     it legible as real data, not a faint aside. -->
{#snippet ratioSuffix(r: number | null | undefined)}
	{#if r != null}
		<span class="ml-1 font-medium text-pqs-steel dark:text-pqs-bluegray">({fmtRatio(r)})</span>
	{/if}
{/snippet}

<!-- Assurance cell: the practical "can we trust the code" axis. One colored pill
     (green = audited/proven, amber = correctness-gated) with the term explained on
     hover, plus a muted "unaudited" where no independent audit exists yet. -->
{#snippet assuranceCell(name: string)}
	{@const a = suiAssuranceFor(name)}
	<td class="whitespace-nowrap px-2 py-1.5">
		{#if a}
			<span
				class="cursor-help rounded px-1.5 py-0.5 text-xs font-medium {TIER_CLASS[a.tier]}"
				title={a.tip}
			>{a.badge}{#if a.impl}&nbsp;({a.impl}){/if}</span>
			{#if a.unaudited}
				<span class="ml-1 text-xs text-pqs-steel dark:text-pqs-bluegray">unaudited</span>
			{/if}
		{:else}
			<span class="text-pqs-bluegray">—</span>
		{/if}
	</td>
{/snippet}

<section class="rounded border border-pqs-apricot/60 bg-white p-4 shadow-sm dark:border-pqs-apricot/40 dark:bg-pqs-midnight-mid">
	<div>
		<h2 class="font-heading text-xl font-bold text-pqs-midnight dark:text-white">
			Sui on-chain lens
		</h2>
		<p class="mt-1 text-xs text-pqs-steel dark:text-pqs-bluegray">
			The FIPS-track candidates, measured on one machine. Keygen and Sign are wallet-side (browser,
			TypeScript); Verify is validator-side (server, Rust). Each cell shows its cost against Ed25519.
		</p>
	</div>

	

	<div class="mt-4 overflow-x-auto rounded border border-pqs-ashgray dark:border-pqs-steel">
		<table class="min-w-full text-sm">
			<thead>
				<tr class="bg-pqs-steel font-heading text-xs text-white">
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Scheme</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Std</th>
					<th scope="col" class="whitespace-nowrap px-2 py-2.5 text-right font-semibold" title="NIST post-quantum security category (1–5; higher is stronger). N/A = pre-quantum classical scheme.">NIST</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">pk+sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Wallet-side: measured in TypeScript, browser/mobile runtime">Keygen (browser)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Wallet-side: measured in TypeScript, browser/mobile runtime">Sign (browser)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Validator-side: measured in Rust, the fastcrypto stack a validator runs">Verify (server)</th>
					<th scope="col" class="whitespace-nowrap px-2 py-2.5 text-left font-semibold">Assurance</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-pqs-ashgray bg-white dark:divide-pqs-steel dark:bg-pqs-midnight-mid">
				{#each measuredRows as row (row.scheme)}
					{@const zooScheme = zooSchemeFor(row.scheme)}
					{@const mysten = row.mysten}
					{@const avgOver = mysten?.impls.length ?? 0}
					{@const ts = row.ts}
					{@const pkSigRatio = mysten && ed25519PkPlusSig ? (mysten.pkLen + mysten.sigLen) / ed25519PkPlusSig : null}
					{@const level = MEASURED_LEVEL[row.scheme]}
					{@const isPick = row.scheme === SUI_PICK.parameterset}
					<tr
						class={isPick
							? 'bg-pqs-apricot/10 dark:bg-pqs-apricot/10'
							: 'hover:bg-pqs-smoke dark:hover:bg-pqs-steel/30'}
					>
						<!-- Scheme (the measured name is the parameter set) -->
						<td class="whitespace-nowrap px-3 py-1.5 {isPick ? 'border-l-4 border-pqs-apricot' : ''}" title={zooScheme?.assumption}>
							{#if zooScheme}
								<a
									href={zooScheme.website}
									target="_blank"
									rel="noopener noreferrer"
									class="font-heading font-semibold text-pqs-steel hover:text-pqs-apricot dark:text-pqs-apricot dark:hover:text-pqs-apricot-light"
								>
									{row.scheme}
								</a>
								<SecurityBadge
									broken={zooScheme.broken}
									warning={zooScheme.warning}
									info={zooScheme.info}
									classical={zooScheme.classical}
								/>
							{:else}
								<span class="font-heading font-semibold text-pqs-steel dark:text-pqs-apricot">{row.scheme}</span>
							{/if}
							{#if isPick}
								<span
									class="ml-1.5 rounded bg-pqs-apricot px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-pqs-midnight"
									title="The parameter set Sui is going with: fastcrypto components are being built for it."
								>{SUI_PICK.badge}</span>
							{/if}
						</td>
						<!-- Std -->
						{@render stdCell(zooScheme)}
						<!-- NIST security level -->
						<td class="px-2 py-1.5 text-right tabular-nums text-pqs-steel dark:text-pqs-bluegray">
							{level ?? '—'}
						</td>
						<!-- pk+sig -->
						<td class="px-3 py-1.5 text-right tabular-nums {mysten ? sizeCellClass(mysten.pkLen + mysten.sigLen) : ''}">
							{mysten ? fmt(mysten.pkLen + mysten.sigLen) : '—'}{@render ratioSuffix(pkSigRatio)}
						</td>
						<!-- Keygen (browser: TypeScript via @mysten/sui / @noble/post-quantum) -->
						<td
							class="px-3 py-1.5 text-right tabular-nums {signCellClass(ts?.keygenNs != null ? ts.keygenNs / 1000 : null)}"
							title={ts ? `${ts.lib}, median of ${ts.keygenIters} iterations` : undefined}
						>
							{ts?.keygenNs != null ? fmtTime(ts.keygenNs / 1000) : '—'}{@render ratioSuffix(ts?.keygenVsEd25519)}
						</td>
						<!-- Sign (browser) -->
						<td
							class="px-3 py-1.5 text-right tabular-nums {signCellClass(ts?.signNs != null ? ts.signNs / 1000 : null)}"
							title={ts ? `${ts.lib}, median of ${ts.signIters} iterations` : undefined}
						>
							{ts?.signNs != null ? fmtTime(ts.signNs / 1000) : '—'}{@render ratioSuffix(ts?.signVsEd25519)}
						</td>
						<!-- Verify (server: Rust via fastcrypto; averaged over impls when a scheme has more than one) -->
						<td
							class="px-3 py-1.5 text-right tabular-nums {verifyCellClass(mysten?.verifyNs != null ? mysten.verifyNs / 1000 : null)}"
							title={mysten && avgOver > 1 ? implSpread(mysten) : undefined}
						>
							{mysten?.verifyNs != null ? fmtTime(mysten.verifyNs / 1000) : '—'}{@render ratioSuffix(mysten?.vsEd25519)}
							{#if avgOver > 1}
								<span class="ml-1 text-pqs-steel dark:text-pqs-bluegray">(avg {avgOver})</span>
							{/if}
						</td>
						{@render assuranceCell(row.scheme)}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-2 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		<span class="font-semibold">Sources</span>: Verify:
		<a href="https://github.com/mahdi-mysten/pq-sig-bench" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">pq-sig-bench</a>
		through fastcrypto (<a href="https://github.com/MystenLabs/fastcrypto/tree/mahdi/fn-dsa-512" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">mahdi/fn-dsa-512</a>, pre-merge).
		Keygen/Sign: <a href="https://github.com/mahdi-mysten/nist-sigs-zoo/blob/mysten-zoo/scripts/ts-bench.ts" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">ts-bench.ts</a>
		via <a href="https://www.npmjs.com/package/@mysten/sui" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">@mysten/sui</a>
		and <a href="https://github.com/paulmillr/noble-post-quantum" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">@noble/post-quantum</a>.
		Both {BENCH_MACHINE}; median of 1000 iterations, fewer for the slow schemes — the hash-based ones
		and both FN-DSA sizes: hover a cell for the exact count. Each benchmark computes its own Ed25519
		ratios; the two are never mixed.
	</p>
	<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		<span class="font-semibold">Caveats</span>: validators batch-verify Ed25519 (~2× amortized) and no
		PQ scheme batches, so the real on-chain gap is about 2× the Verify ratio. FN-DSA-1024 has no
		fastcrypto implementation yet and is shown via PQClean's reference C for scale.
	</p>
</section>
