<script lang="ts">
	import { PENDING_FIPS } from '$lib/constants';
	import { fipsChipLabel, fmt, fmtTime } from '$lib/format';
	import { processYamlSchemes } from '$lib/data';
	import { allSchemeData } from '$lib/schemeData';
	import { aggregateByScheme, type MystenBenchRow, type MystenSchemeAgg } from '$lib/mystenBench';
	import { mystenBench, MYSTEN_HOSTS, type MystenHost } from '$lib/mystenBenchData';
	import { suiAssuranceFor, type SuiAssurance } from '$lib/suiNotes';
	import { sizeCellClass, verifyCellClass } from '$lib/trafficLight';
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

	let host = $state<MystenHost>('mac-m2-max');

	// pq-sig-bench benches one implementation per row — the one Sui would actually
	// run. aggregateByScheme() collapses to one row per scheme, which is a no-op
	// today but keeps this forward-compatible if a scheme is ever multi-impl again
	// (ML-DSA used to be, see the harness README's background section).
	function lensRows(rows: MystenBenchRow[]): MystenSchemeAgg[] {
		const aggs = aggregateByScheme(rows);
		return DISPLAY_SCHEMES.map((s) => aggs.find((a) => a.scheme === s)).filter(
			(a): a is MystenSchemeAgg => a != null
		);
	}

	// The Mac run pins the measured row set; the toggle only swaps which host's run
	// feeds the verify/ratio columns. With server.csv still a placeholder those cells
	// render as "pending" while sizes (host-independent) stay visible.
	const measuredRows = lensRows(mystenBench['mac-m2-max']);

	const hostRows = $derived(lensRows(mystenBench[host]));
	const hostPending = $derived(hostRows.length === 0);
	const hostByScheme = $derived(new Map(hostRows.map((r) => [r.scheme, r])));
	const hostMeta = $derived(MYSTEN_HOSTS.find((h) => h.id === host)!);

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
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="font-heading text-xl font-bold text-pqs-midnight dark:text-white">
				Sui on-chain lens
			</h2>
			<p class="mt-1 text-xs text-pqs-steel dark:text-pqs-bluegray">
				The FIPS-track signature candidates, measured through fastcrypto — the stack a Sui validator would run.
			</p>
		</div>

		<!-- Host toggle: swaps which run feeds the verify + vs-Ed25519 columns -->
		<div class="flex rounded border border-pqs-ashgray dark:border-pqs-steel overflow-hidden shrink-0">
			{#each MYSTEN_HOSTS as h}
				<button
					onclick={() => (host = h.id)}
					class="px-3 py-1.5 text-xs font-heading transition-colors {host === h.id
						? 'bg-pqs-apricot text-pqs-midnight font-semibold'
						: 'bg-white text-pqs-bluegray hover:text-pqs-midnight dark:bg-pqs-midnight-mid dark:text-pqs-steel dark:hover:text-white'}"
				>
					{h.label}
				</button>
			{/each}
		</div>
	</div>

	{#if hostPending}
		<p class="mt-3 rounded border border-pqs-apricot/40 bg-pqs-apricot/10 px-3 py-2 text-xs text-pqs-midnight dark:bg-pqs-apricot/5 dark:text-pqs-smoke">
			Server run not yet imported — see <code class="font-mono">npm run import-bench</code>.
		</p>
	{/if}

	<div class="mt-4 overflow-x-auto rounded border border-pqs-ashgray dark:border-pqs-steel">
		<table class="min-w-full text-sm">
			<thead>
				<tr class="bg-pqs-steel font-heading text-xs text-white">
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Scheme</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Std</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">pk+sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Verify</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">vs Ed25519</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Assurance</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-pqs-ashgray bg-white dark:divide-pqs-steel dark:bg-pqs-midnight-mid">
				{#each measuredRows as row (row.scheme)}
					{@const hostRow = hostByScheme.get(row.scheme)}
					{@const zooScheme = zooSchemeFor(row.scheme)}
					{@const avgOver = hostRow != null ? hostRow.impls.length : 1}
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
						<td class="px-3 py-1.5 text-right tabular-nums {sizeCellClass(row.pkLen + row.sigLen)}">{fmt(row.pkLen + row.sigLen)}</td>
						{#if hostPending}
							<td class="px-3 py-1.5 text-right italic text-pqs-bluegray dark:text-pqs-steel">pending</td>
							<td class="px-3 py-1.5 text-right italic text-pqs-bluegray dark:text-pqs-steel">pending</td>
						{:else}
							<!-- Verify (measured on the selected host; averaged over impls) -->
							<td
								class="px-3 py-1.5 text-right tabular-nums {verifyCellClass(hostRow?.verifyNs != null ? hostRow.verifyNs / 1000 : null)}"
								title={hostRow && avgOver > 1 ? implSpread(hostRow) : undefined}
							>
								{hostRow?.verifyNs != null ? fmtTime(hostRow.verifyNs / 1000) : '—'}
								{#if hostRow && avgOver > 1}
									<span class="text-pqs-bluegray dark:text-pqs-steel">(avg {avgOver})</span>
								{/if}
							</td>
							<!-- vs Ed25519 (harness-computed, intra-run) -->
							<td class="px-3 py-1.5 text-right tabular-nums">
								{hostRow?.vsEd25519 != null ? fmtRatio(hostRow.vsEd25519) : '—'}
							</td>
						{/if}
						{@render assuranceCell(row.scheme)}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-2 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Measured: <a href="https://github.com/mahdi-mysten/pq-sig-bench" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">pq-sig-bench</a>
		through fastcrypto (<a href="https://github.com/MystenLabs/fastcrypto/tree/mahdi/fn-dsa-512" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">mahdi/fn-dsa-512</a> branch, pre-merge)
		— the stack a Sui validator would run — median of 1000 verify iterations, {hostMeta.machine}.
	</p>
	<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Sui validators batch-verify Ed25519, roughly halving its amortized per-signature cost; no PQ
		candidate batches, so the practical on-chain gap is about 2× the vs-Ed25519 column. Each row
		measures one implementation — the one Sui would actually run — except FN-DSA-1024, which has no
		fastcrypto implementation yet and is shown via PQClean's portable reference C for scale. Assurance
		names the implementation behind each row and whether it has an independent audit — hover a pill
		for the specifics.
	</p>
</section>
