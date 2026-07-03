<script lang="ts">
	import { processYamlSchemes } from '$lib/data';
	import { allSchemeData } from '$lib/schemeData';
	import { computeVerifyRatios } from '$lib/mystenBench';
	import { mystenBench, MYSTEN_HOSTS, type MystenHost } from '$lib/mystenBenchData';
	import SuiLensPlot, { type LensPoint } from './SuiLensPlot.svelte';

	// Context rows: the level-1 on-ramp contenders closest to the Sui decision, resolved
	// from the curated zoo YAML at render time so spec updates flow through. Their
	// timings come from the zoo's own bench (i7-12650H, rdtsc) — a different machine —
	// so they are shown for scale only and never enter the vs-Ed25519 ratio.
	const ZOO_REFERENCE_SETS: { scheme: string; parameterset: string }[] = [
		{ scheme: 'HAWK', parameterset: '512' },
		{ scheme: 'MAYO', parameterset: 'one' },
		{ scheme: 'UOV', parameterset: 'Is-pkc' },
		{ scheme: 'SQIsign', parameterset: 'I' },
		{ scheme: 'FAEST', parameterset: '128s' },
	];

	let host = $state<MystenHost>('mac-m2-max');

	// PQClean C rides along in the CSV as the reference implementation of the same
	// verifier: identical math, identical signature bytes. It gets no row of its
	// own — its verify time renders in parentheses inside the Falcon-512 row.
	const PQCLEAN_ROW = 'Falcon-512 (PQClean C)';
	const FALCON_ROW = 'Falcon-512';

	// The Mac run pins the measured row set; the toggle only swaps which host's run
	// feeds the verify/ratio columns. With server.csv still a placeholder those cells
	// render as "pending" while sizes (host-independent) stay visible.
	const measuredRows = mystenBench['mac-m2-max'].filter((r) => r.name !== PQCLEAN_ROW);

	const hostRows = $derived(mystenBench[host]);
	const hostPending = $derived(hostRows.length === 0);
	const hostRatios = $derived(computeVerifyRatios(hostRows));
	const hostByName = $derived(new Map(hostRows.map((r) => [r.name, r])));
	const hostMeta = $derived(MYSTEN_HOSTS.find((h) => h.id === host)!);

	const { parameterSets } = processYamlSchemes(allSchemeData, 'round-3', {
		useLatestVersion: true,
	});
	const referenceRows = ZOO_REFERENCE_SETS.flatMap(({ scheme, parameterset }) => {
		const ps = parameterSets.find((p) => p.scheme === scheme && p.parameterset === parameterset);
		return ps ? [ps] : [];
	});

	function fmt(n: number) {
		return n.toLocaleString();
	}

	function fmtTime(us: number): string {
		if (us >= 1_000_000) return (us / 1_000_000).toFixed(2) + ' s';
		if (us >= 1_000) return (us / 1_000).toFixed(2) + ' ms';
		return us.toFixed(1) + ' µs';
	}

	function fmtRatio(r: number): string {
		return r.toFixed(1) + '×';
	}

	const points = $derived<LensPoint[]>([
		...measuredRows.flatMap((r) => {
			const verifyNs = hostByName.get(r.name)?.verifyNs;
			if (verifyNs == null) return [];
			return [
				{
					label: r.name,
					pk: r.pkLen,
					sig: r.sigLen,
					pkPlusSig: r.pkLen + r.sigLen,
					verifyUs: verifyNs / 1000,
					source: 'Mysten measured' as const,
				},
			];
		}),
		...referenceRows.flatMap((ps) => {
			const verifyUs = ps.verificationUs ?? (ps.verificationCycles > 0 ? ps.verificationCycles / 2500 : null);
			if (verifyUs == null) return [];
			return [
				{
					label: `${ps.scheme}-${ps.parameterset}`,
					pk: ps.pk,
					sig: ps.sig,
					pkPlusSig: ps.pkPlusSig,
					verifyUs,
					source: 'Zoo reference' as const,
				},
			];
		}),
	]);
</script>

<section class="rounded border border-pqs-apricot/60 bg-white p-4 shadow-sm dark:border-pqs-apricot/40 dark:bg-pqs-midnight-mid">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="font-heading text-xl font-bold text-pqs-midnight dark:text-white">
				Sui on-chain lens
			</h2>
			<p class="mt-1 text-xs text-pqs-steel dark:text-pqs-bluegray">
				Verification cost and on-chain footprint of the PQ-authenticator candidates, measured by our own harness.
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
					<th scope="col" class="whitespace-nowrap px-3 py-2 text-left font-semibold">Scheme</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2 text-right font-semibold">pk (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2 text-right font-semibold">sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2 text-right font-semibold">pk+sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2 text-right font-semibold">verify (median)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2 text-right font-semibold">vs Ed25519</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-pqs-ashgray bg-white dark:divide-pqs-steel dark:bg-pqs-midnight-mid">
				{#each measuredRows as row (row.name)}
					{@const hostRow = hostByName.get(row.name)}
					{@const ratio = hostRatios.get(row.name)}
					<tr class="hover:bg-pqs-smoke dark:hover:bg-pqs-steel/30">
						<td class="whitespace-nowrap px-3 py-1.5 font-heading font-semibold text-pqs-steel dark:text-pqs-apricot" title={row.family}>
							{row.name}
						</td>
						<td class="px-3 py-1.5 text-right tabular-nums">{fmt(row.pkLen)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums">{fmt(row.sigLen)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums">{fmt(row.pkLen + row.sigLen)}</td>
						{#if hostPending}
							<td class="px-3 py-1.5 text-right italic text-pqs-bluegray dark:text-pqs-steel">pending</td>
							<td class="px-3 py-1.5 text-right italic text-pqs-bluegray dark:text-pqs-steel">pending</td>
						{:else}
							<td class="px-3 py-1.5 text-right tabular-nums">
								{hostRow?.verifyNs != null ? fmtTime(hostRow.verifyNs / 1000) : '—'}
								{#if row.name === FALCON_ROW && hostByName.get(PQCLEAN_ROW)?.verifyNs != null}
									<span
										class="text-pqs-bluegray dark:text-pqs-steel"
										title="Same verifier math and identical signature bytes; PQClean is the deliberately portable reference C, ours is hand-optimized Rust with precomputed Montgomery-NTT tables."
									>
										(PQClean C: {fmtTime(hostByName.get(PQCLEAN_ROW)!.verifyNs / 1000)})
									</span>
								{/if}
							</td>
							<td class="px-3 py-1.5 text-right tabular-nums">
								{ratio != null ? fmtRatio(ratio) : '—'}
							</td>
						{/if}
					</tr>
				{/each}

				<!-- Zoo reference rows: sizes from the curated YAML, timings from the zoo's
				     i7 bench — kept visually separate and out of the ratio column. -->
				<tr class="bg-pqs-smoke dark:bg-pqs-midnight">
					<td colspan="6" class="px-3 py-1.5 font-heading text-xs font-semibold text-pqs-steel/80 dark:text-pqs-bluegray/80">
						zoo reference data (i7-12650H, rdtsc)
					</td>
				</tr>
				{#each referenceRows as ps (ps.scheme + ps.parameterset)}
					<tr class="bg-pqs-smoke/60 text-pqs-steel/90 dark:bg-pqs-midnight/60 dark:text-pqs-bluegray">
						<td class="whitespace-nowrap px-3 py-1.5 font-heading" title={ps.assumption}>
							{ps.scheme}-{ps.parameterset}
						</td>
						<td class="px-3 py-1.5 text-right tabular-nums">{fmt(ps.pk)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums">{fmt(ps.sig)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums">{fmt(ps.pkPlusSig)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums">
							{ps.verificationUs != null ? fmtTime(ps.verificationUs) : '—'}
						</td>
						<td class="px-3 py-1.5 text-right" title="Different machine — not comparable with the Mysten ratios">—</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-2 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Measured: pq-bench, median of 1000 verify iterations — {hostMeta.machine}.
		Reference: NIST Signatures Zoo benchmark data (Thom Wiggers / PQShield, CC-BY-4.0) — i7-12650H, rdtsc.
	</p>
	<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Falcon-512 shows two numbers for one verifier: both run the same math over the identical
		signature bytes (interop-checked every run). Ours is hand-optimized Rust with precomputed
		Montgomery-NTT tables; the parenthetical is PQClean's reference C, whose "clean" variant is
		deliberately portable and unoptimized — the gap is engineering, not algorithm.
	</p>

	<div class="mt-4">
		<h3 class="mb-2 font-heading text-sm font-semibold text-pqs-steel dark:text-pqs-apricot">
			On-chain footprint vs. verify time <span class="font-normal text-pqs-bluegray">(log–log scale)</span>
		</h3>
		<SuiLensPlot {points} />
	</div>
</section>
