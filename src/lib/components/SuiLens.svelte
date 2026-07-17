<script lang="ts">
	import { PENDING_FIPS } from '$lib/constants';
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

	// The measured schemes shown, in table order. Only these render — the CSV also
	// carries the SLH-DSA SHA2 variants, kept out of this minimal decision view.
	const DISPLAY_SCHEMES = [
		'Ed25519',
		'FN-DSA-512',
		'FN-DSA-1024',
		'ML-DSA-44',
		'ML-DSA-65',
		'ML-DSA-87',
		'SLH-DSA-SHAKE-128s',
		'SLH-DSA-SHAKE-128f',
	];

	// pq-sig-bench benches one implementation per row — the one Sui would actually
	// run. aggregateByScheme() collapses to one row per scheme, which is a no-op
	// today but keeps this forward-compatible if a scheme is ever multi-impl again
	// (ML-DSA used to be, see the harness README's background section).
	const aggs = aggregateByScheme(mystenBench);
	const mystenByScheme = new Map(aggs.map((a) => [a.scheme, a]));

	// Keygen/Sign are a separate measurement (scripts/ts-bench.ts, TypeScript via
	// @mysten/sui / @noble/post-quantum — the libraries a Sui wallet would use) —
	// joined onto the Rust-measured rows by scheme name.
	const tsByScheme = new Map(tsBench.map((r) => [r.scheme, r]));

	// A scheme renders as long as EITHER source has it — Verify degrades to "—" if
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
	};
	function zooSchemeFor(name: string): Scheme | undefined {
		const mapped = MEASURED_SCHEME[name];
		return schemes.find((s) => s.scheme === mapped);
	}

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

<!-- Muted "(X.X×)" suffix vs the Ed25519 baseline, shared by Keygen/Sign/Verify —
     each column's ratio is intra-run against its own CSV's own Ed25519 row
     (ts-bench.csv for Keygen/Sign, mac-m2-max.csv for Verify), never cross-CSV. -->
{#snippet ratioSuffix(r: number | null | undefined)}
	{#if r != null}
		<span class="ml-1 text-pqs-bluegray dark:text-pqs-steel">({fmtRatio(r)})</span>
	{/if}
{/snippet}

<!-- Assurance cell: the practical "can we trust the code" axis. One colored pill
     (green = audited/proven, amber = correctness-gated) with the term explained on
     hover, plus a muted "unaudited" where no independent audit exists yet. -->
{#snippet assuranceCell(name: string)}
	{@const a = suiAssuranceFor(name)}
	<td class="whitespace-nowrap px-3 py-1.5">
		{#if a}
			<span
				class="cursor-help rounded px-1.5 py-0.5 text-xs font-medium {TIER_CLASS[a.tier]}"
				title={a.tip}
			>{a.badge}{#if a.impl}&nbsp;({a.impl}){/if}</span>
			{#if a.unaudited}
				<span class="ml-1 text-xs text-pqs-bluegray dark:text-pqs-steel">unaudited</span>
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
			The FIPS-track signature candidates. Keygen and Sign run in the browser — a wallet operation,
			measured in TypeScript through the libraries a Sui wallet would actually use. Verify runs on
			the validator server — measured through fastcrypto, the stack a Sui validator would run. Each
			cell also shows its cost as a ratio against Ed25519.
		</p>
	</div>

	<div class="mt-4 overflow-x-auto rounded border border-pqs-ashgray dark:border-pqs-steel">
		<table class="min-w-full text-sm">
			<thead>
				<tr class="bg-pqs-steel font-heading text-xs text-white">
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Scheme</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Std</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">pk+sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Wallet-side: measured in TypeScript, browser/mobile runtime">Keygen (browser)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Wallet-side: measured in TypeScript, browser/mobile runtime">Sign (browser)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold" title="Validator-side: measured in Rust, the fastcrypto stack a validator runs">Verify (server)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Assurance</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-pqs-ashgray bg-white dark:divide-pqs-steel dark:bg-pqs-midnight-mid">
				{#each measuredRows as row (row.scheme)}
					{@const zooScheme = zooSchemeFor(row.scheme)}
					{@const mysten = row.mysten}
					{@const avgOver = mysten?.impls.length ?? 0}
					{@const ts = row.ts}
					<tr class="hover:bg-pqs-smoke dark:hover:bg-pqs-steel/30">
						<!-- Scheme (the measured name is the parameter set) -->
						<td class="whitespace-nowrap px-3 py-1.5" title={zooScheme?.assumption}>
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
						</td>
						<!-- Std -->
						{@render stdCell(zooScheme)}
						<!-- pk+sig -->
						<td class="px-3 py-1.5 text-right tabular-nums {mysten ? sizeCellClass(mysten.pkLen + mysten.sigLen) : ''}">
							{mysten ? fmt(mysten.pkLen + mysten.sigLen) : '—'}
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
								<span class="ml-1 text-pqs-bluegray dark:text-pqs-steel">(avg {avgOver})</span>
							{/if}
						</td>
						{@render assuranceCell(row.scheme)}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-2 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Verify (server): <a href="https://github.com/mahdi-mysten/pq-sig-bench" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">pq-sig-bench</a>
		through fastcrypto (<a href="https://github.com/MystenLabs/fastcrypto/tree/mahdi/fn-dsa-512" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">mahdi/fn-dsa-512</a> branch, pre-merge)
		— the stack a Sui validator would run — median of 1000 verify iterations, {BENCH_MACHINE}. Its ratio
		is the harness's own intra-run number against this same run's Ed25519 row, never recomputed.
	</p>
	<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Keygen/Sign (browser): <a href="https://github.com/mahdi-mysten/nist-sigs-zoo/blob/mysten-zoo/scripts/ts-bench.ts" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">scripts/ts-bench.ts</a>,
		measured in TypeScript through <a href="https://www.npmjs.com/package/@mysten/sui" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">@mysten/sui</a>
		(Ed25519) and <a href="https://github.com/paulmillr/noble-post-quantum" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">@noble/post-quantum</a>
		(the PQ schemes) — the libraries a browser or mobile wallet would actually run, a different stack
		and a different Ed25519 baseline from Verify's. Median of 1000 iterations, except SLH-DSA-SHAKE-128s
		(30) and every other slow scheme (100) — hover a cell for the exact count; each iteration signs a
		fresh random message under one key, matching the Rust harness's own methodology.
	</p>
	<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Sui validators batch-verify Ed25519, roughly halving its amortized per-signature cost; no PQ
		candidate batches, so the practical on-chain gap is about 2× the Verify column's ratio. Each row
		measures one implementation — the one Sui would actually run — except FN-DSA-1024, which has no
		fastcrypto implementation yet and is shown via PQClean's portable reference C for scale. Assurance
		names the implementation behind each row and whether it has an independent audit — hover a pill
		for the specifics.
	</p>
</section>
