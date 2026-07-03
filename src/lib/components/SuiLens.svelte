<script lang="ts">
	import { processYamlSchemes } from '$lib/data';
	import { fmt, fmtCycles, fmtTime } from '$lib/format';
	import { allSchemeData } from '$lib/schemeData';
	import { computeVerifyRatios } from '$lib/mystenBench';
	import { mystenBench, MYSTEN_HOSTS } from '$lib/mystenBenchData';
	import { suiHost } from '$lib/suiHostStore';
	import { sizeCellClass, signCellClass, verifyCellClass } from '$lib/trafficLight';
	import type { Scheme } from '$lib/types';
	import SecurityBadge from './SecurityBadge.svelte';
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

	// Shared with the impact-model section below, so its scenarios always use
	// the same host's verify medians as the columns shown here.
	const host = $derived($suiHost);

	// PQClean C rides along in the CSV as the reference implementation of the same
	// verifier: identical math, identical signature bytes. It gets no row of its
	// own — its verify time renders in parentheses inside the Falcon-512 row.
	const PQCLEAN_ROW = 'Falcon-512 (PQClean C)';
	const FALCON_ROW = 'Falcon-512';

	// The Mac run pins the measured row set; the toggle only swaps which host's run
	// feeds the sign/verify/ratio columns. With server.csv still a placeholder those
	// cells render as "pending" while sizes (host-independent) stay visible.
	const measuredRows = mystenBench['mac-m2-max'].filter((r) => r.name !== PQCLEAN_ROW);

	const hostRows = $derived(mystenBench[host]);
	const hostPending = $derived(hostRows.length === 0);
	const hostRatios = $derived(computeVerifyRatios(hostRows));
	const hostByName = $derived(new Map(hostRows.map((r) => [r.name, r])));
	const hostMeta = $derived(MYSTEN_HOSTS.find((h) => h.id === host)!);

	const { schemes, parameterSets } = processYamlSchemes(allSchemeData, 'round-3', {
		useLatestVersion: true,
	});
	const referenceRows = ZOO_REFERENCE_SETS.flatMap(({ scheme, parameterset }) => {
		const ps = parameterSets.find((p) => p.scheme === scheme && p.parameterset === parameterset);
		return ps ? [ps] : [];
	});

	// Measured rows are keyed by parameter-set name; recover the zoo scheme for
	// the metadata columns (category, status, badges) so both halves of the table
	// render from the same source. Ed25519 is the odd one out — the zoo scheme is
	// called EdDSA; the rest resolve by longest name prefix (Falcon-512 → Falcon).
	const MEASURED_SCHEME_ALIAS: Record<string, string> = { Ed25519: 'EdDSA' };
	function zooSchemeFor(name: string): Scheme | undefined {
		const alias = MEASURED_SCHEME_ALIAS[name];
		let best: Scheme | undefined;
		for (const s of schemes) {
			if (s.scheme === alias) return s;
			if (name.startsWith(s.scheme) && (!best || s.scheme.length > best.scheme.length)) best = s;
		}
		return best;
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

<!-- Status cell rendering mirrors SchemeTable — keep the two in sync. -->
{#snippet statusCell(status: string)}
	{#if status === 'FIPS'}
		<span class="rounded bg-pqs-apricot/20 px-1.5 py-0.5 text-xs font-semibold text-pqs-apricot">FIPS</span>
	{:else if status === 'To be standardized'}
		<span class="rounded bg-pqs-steel/10 px-1.5 py-0.5 text-xs font-semibold text-pqs-steel dark:text-pqs-bluegray">Std pending</span>
	{:else if status === 'Classic cryptography'}
		<span class="text-pqs-steel/70 dark:text-pqs-bluegray/70">Classic</span>
	{:else}
		<span class="text-pqs-steel/70 dark:text-pqs-bluegray/70">{status}</span>
	{/if}
{/snippet}

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

		<!-- Host toggle: swaps which run feeds the sign/verify + vs-Ed25519 columns -->
		<div class="flex rounded border border-pqs-ashgray dark:border-pqs-steel overflow-hidden shrink-0">
			{#each MYSTEN_HOSTS as h}
				<button
					onclick={() => suiHost.set(h.id)}
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

	<!-- Column list mirrors SchemeTable (same order, header style, cell formatting);
	     the lens extras — host-measured verify and vs Ed25519 — stay last. -->
	<div class="mt-4 overflow-x-auto rounded border border-pqs-ashgray dark:border-pqs-steel">
		<table class="min-w-full text-sm">
			<thead>
				<tr class="bg-pqs-steel font-heading text-xs text-white">
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Scheme</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Category</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Status</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Parameter Set</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Level</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">pk (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">pk+sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Sign</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Verify (median)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">vs Ed25519</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-pqs-ashgray bg-white dark:divide-pqs-steel dark:bg-pqs-midnight-mid">
				{#each measuredRows as row (row.name)}
					{@const hostRow = hostByName.get(row.name)}
					{@const ratio = hostRatios.get(row.name)}
					{@const zooScheme = zooSchemeFor(row.name)}
					{@const pqcleanVerifyNs = hostByName.get(PQCLEAN_ROW)?.verifyNs}
					<tr class="hover:bg-pqs-smoke dark:hover:bg-pqs-steel/30">
						<!-- Scheme -->
						<td class="whitespace-nowrap px-3 py-1.5" title={row.family}>
							{#if zooScheme}
								<a
									href={zooScheme.website}
									target="_blank"
									rel="noopener noreferrer"
									class="font-heading font-semibold text-pqs-steel hover:text-pqs-apricot dark:text-pqs-apricot dark:hover:text-pqs-apricot-light"
								>
									{zooScheme.scheme}
								</a>
								<SecurityBadge
									broken={zooScheme.broken}
									warning={zooScheme.warning}
									info={zooScheme.info}
									classical={zooScheme.classical}
								/>
							{:else}
								<span class="font-heading font-semibold text-pqs-steel dark:text-pqs-apricot">{row.name}</span>
							{/if}
						</td>
						<!-- Category -->
						<td class="whitespace-nowrap px-3 py-1.5 text-pqs-steel dark:text-pqs-bluegray" title={zooScheme?.assumption}>
							{zooScheme?.category ?? row.family}
						</td>
						<!-- Status -->
						<td class="whitespace-nowrap px-3 py-1.5">
							{#if zooScheme}
								{@render statusCell(zooScheme.status)}
							{:else}
								<span class="text-pqs-steel/70 dark:text-pqs-bluegray/70">{row.std}</span>
							{/if}
						</td>
						<!-- Parameterset -->
						<td class="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{row.name}</td>
						<!-- Level -->
						<td class="px-3 py-1.5 text-right tabular-nums text-pqs-steel dark:text-pqs-bluegray">
							{row.securityLevel === '' ? 'N/A' : row.securityLevel}
						</td>
						<!-- pk / sig / pk+sig -->
						<td class="px-3 py-1.5 text-right tabular-nums {sizeCellClass(row.pkLen)}">{fmt(row.pkLen)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums {sizeCellClass(row.sigLen)}">{fmt(row.sigLen)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums {sizeCellClass(row.pkLen + row.sigLen)}">{fmt(row.pkLen + row.sigLen)}</td>
						{#if hostPending}
							<td class="px-3 py-1.5 text-right italic text-pqs-bluegray dark:text-pqs-steel">pending</td>
							<td class="px-3 py-1.5 text-right italic text-pqs-bluegray dark:text-pqs-steel">pending</td>
							<td class="px-3 py-1.5 text-right italic text-pqs-bluegray dark:text-pqs-steel">pending</td>
						{:else}
							<!-- Sign (measured on the selected host) -->
							<td class="px-3 py-1.5 text-right tabular-nums {signCellClass(hostRow?.signNs != null ? hostRow.signNs / 1000 : null)}">
								{#if hostRow?.signNs != null}
									{fmtTime(hostRow.signNs / 1000)}
								{:else}
									<span class="text-pqs-bluegray">—</span>
								{/if}
							</td>
							<!-- Verify (measured on the selected host) -->
							<td class="px-3 py-1.5 text-right tabular-nums {verifyCellClass(hostRow?.verifyNs != null ? hostRow.verifyNs / 1000 : null)}">
								{hostRow?.verifyNs != null ? fmtTime(hostRow.verifyNs / 1000) : '—'}
								{#if row.name === FALCON_ROW && pqcleanVerifyNs != null}
									<span
										class="text-pqs-bluegray dark:text-pqs-steel"
										title="Same verifier math and identical signature bytes; PQClean is the deliberately portable reference C, ours is hand-optimized Rust with precomputed Montgomery-NTT tables."
									>
										(PQClean C: {fmtTime(pqcleanVerifyNs / 1000)})
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
					<td colspan="11" class="px-3 py-1.5 font-heading text-xs font-semibold text-pqs-steel/80 dark:text-pqs-bluegray/80">
						zoo reference data (i7-12650H, rdtsc)
					</td>
				</tr>
				{#each referenceRows as ps (ps.scheme + ps.parameterset)}
					{@const signUs = ps.signingUs ?? (ps.signingCycles > 0 ? ps.signingCycles / 2500 : null)}
					{@const verifyUs = ps.verificationUs ?? (ps.verificationCycles > 0 ? ps.verificationCycles / 2500 : null)}
					<tr class="bg-pqs-smoke/60 text-pqs-steel/90 dark:bg-pqs-midnight/60 dark:text-pqs-bluegray">
						<!-- Scheme -->
						<td class="whitespace-nowrap px-3 py-1.5" title={ps.assumption}>
							<a
								href={ps.website}
								target="_blank"
								rel="noopener noreferrer"
								class="font-heading font-semibold text-pqs-steel hover:text-pqs-apricot dark:text-pqs-apricot dark:hover:text-pqs-apricot-light"
							>
								{ps.scheme}
							</a>
							<SecurityBadge broken={ps.broken} warning={ps.warning} info={ps.info} classical={ps.classical} />
						</td>
						<!-- Category -->
						<td class="whitespace-nowrap px-3 py-1.5" title={ps.assumption}>{ps.category}</td>
						<!-- Status -->
						<td class="whitespace-nowrap px-3 py-1.5">{@render statusCell(ps.status)}</td>
						<!-- Parameterset -->
						<td class="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{ps.parameterset}</td>
						<!-- Level -->
						<td class="px-3 py-1.5 text-right tabular-nums">
							{ps.level === 'Pre-Quantum' ? 'N/A' : ps.level}
						</td>
						<!-- pk / sig / pk+sig -->
						<td class="px-3 py-1.5 text-right tabular-nums {sizeCellClass(ps.pk)}">{fmt(ps.pk)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums {sizeCellClass(ps.sig)}">{fmt(ps.sig)}</td>
						<td class="px-3 py-1.5 text-right tabular-nums {sizeCellClass(ps.pkPlusSig)}">{fmt(ps.pkPlusSig)}</td>
						<!-- Sign (zoo bench) -->
						<td class="px-3 py-1.5 text-right tabular-nums {signCellClass(signUs)}">
							{#if ps.signingUs != null}
								{fmtTime(ps.signingUs)}
							{:else if ps.signingCycles > 0}
								<span
									class="underline decoration-wavy decoration-pqs-scarlet"
									title="Estimated from {fmtCycles(ps.signingCycles)} cycles @ 2.5 GHz"
								>
									{fmtTime(ps.signingCycles / 2500)}
								</span>
							{:else}
								<span class="text-pqs-bluegray">—</span>
							{/if}
						</td>
						<!-- Verify (zoo bench) -->
						<td class="px-3 py-1.5 text-right tabular-nums {verifyCellClass(verifyUs)}">
							{#if ps.verificationUs != null}
								{fmtTime(ps.verificationUs)}
							{:else if ps.verificationCycles > 0}
								<span
									class="underline decoration-wavy decoration-pqs-scarlet"
									title="Estimated from {fmtCycles(ps.verificationCycles)} cycles @ 2.5 GHz"
								>
									{fmtTime(ps.verificationCycles / 2500)}
								</span>
							{:else}
								<span class="text-pqs-bluegray">—</span>
							{/if}
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
		deliberately portable and unoptimized, the gap is engineering, not algorithm.
	</p>

	<div class="mt-4">
		<h3 class="mb-2 font-heading text-sm font-semibold text-pqs-steel dark:text-pqs-apricot">
			On-chain footprint vs. verify time <span class="font-normal text-pqs-bluegray">(log–log scale)</span>
		</h3>
		<SuiLensPlot {points} />
	</div>
</section>
