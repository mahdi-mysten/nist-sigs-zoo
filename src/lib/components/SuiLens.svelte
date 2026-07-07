<script lang="ts">
	import { PENDING_FIPS } from '$lib/constants';
	import { processYamlSchemes } from '$lib/data';
	import { fipsChipLabel, fmt, fmtCycles, fmtTime } from '$lib/format';
	import { allSchemeData } from '$lib/schemeData';
	import { aggregateByScheme, type MystenBenchRow, type MystenSchemeAgg } from '$lib/mystenBench';
	import { mystenBench, MYSTEN_HOSTS, type MystenHost } from '$lib/mystenBenchData';
	import { suiNoteFor, type SuiFlag } from '$lib/suiNotes';
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

	let host = $state<MystenHost>('mac-m2-max');

	// FN-DSA ships two implementations of one verifier: fastcrypto's Montgomery-NTT
	// Rust (what a validator would actually run) and PQClean's reference C yardstick.
	// The row shows the fastcrypto numbers with PQClean in parentheses. Every other
	// multi-impl scheme (ML-DSA today) averages across all implementations instead —
	// there is no fastcrypto ML-DSA yet, so no single impl is "ours".
	const FALCON_SCHEME = 'FN-DSA-512';
	const isPqclean = (r: MystenBenchRow) => r.impl.includes('PQClean');

	interface LensRow extends MystenSchemeAgg {
		pqcleanSignNs: number | null;
		pqcleanVerifyNs: number | null;
	}

	function lensRows(rows: MystenBenchRow[]): LensRow[] {
		return aggregateByScheme(rows).map((agg) => {
			if (agg.scheme === FALCON_SCHEME && agg.impls.some(isPqclean)) {
				const pqclean = agg.impls.find(isPqclean)!;
				const [ours] = aggregateByScheme(agg.impls.filter((r) => !isPqclean(r)));
				return {
					...(ours ?? agg),
					impls: agg.impls,
					pqcleanSignNs: pqclean.signNs,
					pqcleanVerifyNs: pqclean.verifyNs,
				};
			}
			return { ...agg, pqcleanSignNs: null, pqcleanVerifyNs: null };
		});
	}

	// The Mac run pins the measured row set; the toggle only swaps which host's run
	// feeds the sign/verify/ratio columns. With server.csv still a placeholder those
	// cells render as "pending" while sizes (host-independent) stay visible.
	const measuredRows = lensRows(mystenBench['mac-m2-max']);

	const hostRows = $derived(lensRows(mystenBench[host]));
	const hostPending = $derived(hostRows.length === 0);
	const hostByScheme = $derived(new Map(hostRows.map((r) => [r.scheme, r])));
	const hostMeta = $derived(MYSTEN_HOSTS.find((h) => h.id === host)!);

	const { schemes, parameterSets } = processYamlSchemes(allSchemeData, 'round-3', {
		useLatestVersion: true,
	});
	const referenceRows = ZOO_REFERENCE_SETS.flatMap(({ scheme, parameterset }) => {
		const ps = parameterSets.find((p) => p.scheme === scheme && p.parameterset === parameterset);
		return ps ? [ps] : [];
	});

	// Measured rows are keyed by the harness scheme name; map to the zoo scheme and
	// parameter set for the metadata columns (category, status, level, badges) so
	// both halves of the table render from the same source.
	// `level` is the fallback when the zoo YAML doesn't carry the exact set
	// (e.g. the SLH-DSA SHA2 variants — upstream only lists the SHAKE ones).
	const MEASURED_ZOO: Record<string, { scheme: string; set: string; level: string }> = {
		Ed25519: { scheme: 'EdDSA', set: 'Ed25519', level: 'N/A' },
		'FN-DSA-512': { scheme: 'Falcon', set: '512', level: '1' },
		'ML-DSA-44': { scheme: 'ML-DSA', set: 'ML-DSA-44', level: '2' },
		'SLH-DSA-SHAKE-128s': { scheme: 'SLH-DSA', set: 'SHAKE-128s', level: '1' },
		'SLH-DSA-SHAKE-128f': { scheme: 'SLH-DSA', set: 'SHAKE-128f', level: '1' },
		'SLH-DSA-SHA2-128s': { scheme: 'SLH-DSA', set: 'SHA2-128s', level: '1' },
		'SLH-DSA-SHA2-128f': { scheme: 'SLH-DSA', set: 'SHA2-128f', level: '1' },
	};
	function zooSchemeFor(name: string): Scheme | undefined {
		const mapped = MEASURED_ZOO[name]?.scheme;
		let best: Scheme | undefined;
		for (const s of schemes) {
			if (s.scheme === mapped) return s;
			if (name.startsWith(s.scheme) && (!best || s.scheme.length > best.scheme.length)) best = s;
		}
		return best;
	}
	function zooLevelFor(name: string): string {
		const m = MEASURED_ZOO[name];
		if (!m) return 'N/A';
		const ps = parameterSets.find((p) => p.scheme === m.scheme && p.parameterset === m.set);
		if (!ps) return m.level;
		return ps.level === 'Pre-Quantum' ? 'N/A' : String(ps.level);
	}

	function fmtRatio(r: number): string {
		return r.toFixed(1) + '×';
	}

	// Flag pill palette — mirrors the traffic-light greens/reds of the value cells.
	const FLAG_CLASS: Record<SuiFlag['kind'], string> = {
		good: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
		warn: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
		bad: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
	};

	// Tooltip body listing the per-implementation numbers behind an averaged cell.
	function implSpread(row: LensRow, field: 'signNs' | 'verifyNs'): string {
		return row.impls
			.filter((r) => r[field] != null)
			.map((r) => `${r.impl}: ${fmtTime((r[field] as number) / 1000)}`)
			.join(' · ');
	}

	const points = $derived<LensPoint[]>([
		...measuredRows.flatMap((r) => {
			const verifyNs = hostByScheme.get(r.scheme)?.verifyNs;
			if (verifyNs == null) return [];
			return [
				{
					label: r.scheme,
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

<!-- Status cell rendering mirrors SchemeTable — keep the two in sync. The FIPS
     chip names the concrete standard ("FIPS 204") from the version label; a
     pending FIPS number comes from PENDING_FIPS (Falcon → "FIPS 206 pending"). -->
{#snippet statusCell(status: string, version: string, schemeName: string)}
	{#if status === 'FIPS'}
		<span class="rounded bg-pqs-apricot/20 px-1.5 py-0.5 text-xs font-semibold text-pqs-apricot">{fipsChipLabel(version)}</span>
	{:else if status === 'To be standardized'}
		<span class="rounded bg-pqs-steel/10 px-1.5 py-0.5 text-xs font-semibold text-pqs-steel dark:text-pqs-bluegray">
			{PENDING_FIPS[schemeName] ? `${PENDING_FIPS[schemeName]} pending` : 'Std pending'}
		</span>
	{:else if status === 'Classic cryptography'}
		<span class="text-pqs-steel/70 dark:text-pqs-bluegray/70">Classic</span>
	{:else}
		<span class="text-pqs-steel/70 dark:text-pqs-bluegray/70">{status}</span>
	{/if}
{/snippet}

<!-- Details cell: the qualitative half of the decision as compact flags —
     green strength / amber caveat / red risk. The scannable claim is the label;
     the verified specifics live in the tooltip. See src/lib/suiNotes.ts. -->
{#snippet detailsCell(key: string, schemeFallback: string | undefined)}
	{@const flags = suiNoteFor(key, schemeFallback)}
	<td class="min-w-56 px-3 py-1.5">
		{#if flags}
			<div class="flex max-w-80 flex-wrap gap-1">
				{#each flags as f (f.label)}
					<span
						class="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 {FLAG_CLASS[f.kind]} {f.tip ? 'cursor-help' : ''}"
						title={f.tip}
					>{f.label}</span>
				{/each}
			</div>
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
				Verification cost and on-chain footprint of the PQ-authenticator candidates, measured by our own harness through fastcrypto.
			</p>
		</div>

		<!-- Host toggle: swaps which run feeds the sign/verify + vs-Ed25519 columns -->
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

	<!-- Column list mirrors SchemeTable (same order, header style, cell formatting),
	     minus the Parameter Set column (folded into Scheme) and plus the lens
	     extras: host-measured verify, vs Ed25519 and the qualitative Details. -->
	<div class="mt-4 overflow-x-auto rounded border border-pqs-ashgray dark:border-pqs-steel">
		<table class="min-w-full text-sm">
			<thead>
				<tr class="bg-pqs-steel font-heading text-xs text-white">
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Scheme</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Category</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Status</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Level</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">pk (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">pk+sig (B)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Sign</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Verify (median)</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">vs Ed25519</th>
					<th scope="col" class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Details</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-pqs-ashgray bg-white dark:divide-pqs-steel dark:bg-pqs-midnight-mid">
				{#each measuredRows as row (row.scheme)}
					{@const hostRow = hostByScheme.get(row.scheme)}
					{@const zooScheme = zooSchemeFor(row.scheme)}
					<!-- Averaging annotations must describe the SELECTED host's run, not the
					     Mac row pinning the row set — impl composition can differ per host. -->
					{@const avgOver = hostRow != null && hostRow.pqcleanVerifyNs == null ? hostRow.impls.length : 1}
					<tr class="hover:bg-pqs-smoke dark:hover:bg-pqs-steel/30">
						<!-- Scheme (parameter set folded in: the measured name is the set) -->
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
						<!-- Category -->
						<td class="whitespace-nowrap px-3 py-1.5 text-pqs-steel dark:text-pqs-bluegray" title={zooScheme?.assumption}>
							{zooScheme?.category ?? '—'}
						</td>
						<!-- Status -->
						<td class="whitespace-nowrap px-3 py-1.5">
							{#if zooScheme}
								{@render statusCell(zooScheme.status, zooScheme.version, zooScheme.scheme)}
							{:else}
								<span class="text-pqs-steel/70 dark:text-pqs-bluegray/70">—</span>
							{/if}
						</td>
						<!-- Level -->
						<td class="px-3 py-1.5 text-right tabular-nums text-pqs-steel dark:text-pqs-bluegray">
							{zooLevelFor(row.scheme)}
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
							<!-- Sign (measured on the selected host; averaged over impls) -->
							<td
								class="px-3 py-1.5 text-right tabular-nums {signCellClass(hostRow?.signNs != null ? hostRow.signNs / 1000 : null)}"
								title={hostRow && avgOver > 1 ? implSpread(hostRow, 'signNs') : undefined}
							>
								{#if hostRow?.signNs != null}
									{fmtTime(hostRow.signNs / 1000)}
								{:else}
									<span class="text-pqs-bluegray">—</span>
								{/if}
								{#if hostRow?.pqcleanSignNs != null}
									<span
										class="text-pqs-bluegray dark:text-pqs-steel"
										title="fastcrypto's FN-DSA module is verify-only by design — signing carries Falcon's floating-point sampler and never runs on validators. PQClean's reference C signer shown for scale."
									>
										(PQClean C: {fmtTime(hostRow.pqcleanSignNs / 1000)})
									</span>
								{/if}
							</td>
							<!-- Verify (measured on the selected host; averaged over impls) -->
							<td
								class="px-3 py-1.5 text-right tabular-nums {verifyCellClass(hostRow?.verifyNs != null ? hostRow.verifyNs / 1000 : null)}"
								title={hostRow && avgOver > 1 ? implSpread(hostRow, 'verifyNs') : undefined}
							>
								{hostRow?.verifyNs != null ? fmtTime(hostRow.verifyNs / 1000) : '—'}
								{#if hostRow && avgOver > 1}
									<span class="text-pqs-bluegray dark:text-pqs-steel">(avg of {avgOver})</span>
								{/if}
								{#if hostRow?.pqcleanVerifyNs != null}
									<span
										class="text-pqs-bluegray dark:text-pqs-steel"
										title="Same verifier math and identical signature bytes; PQClean is the deliberately portable reference C, ours is hand-optimized Rust with precomputed Montgomery-NTT tables."
									>
										(PQClean C: {fmtTime(hostRow.pqcleanVerifyNs / 1000)})
									</span>
								{/if}
							</td>
							<!-- vs Ed25519 (harness-computed, intra-run) -->
							<td class="px-3 py-1.5 text-right tabular-nums">
								{#if hostRow?.vsEd25519 != null}
									{fmtRatio(hostRow.vsEd25519)}
								{:else}
									—
								{/if}
							</td>
						{/if}
						{@render detailsCell(row.scheme, zooScheme?.scheme)}
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
						<!-- Scheme (parameter set folded in) -->
						<td class="whitespace-nowrap px-3 py-1.5" title={ps.assumption}>
							<a
								href={ps.website}
								target="_blank"
								rel="noopener noreferrer"
								class="font-heading font-semibold text-pqs-steel hover:text-pqs-apricot dark:text-pqs-apricot dark:hover:text-pqs-apricot-light"
							>
								{ps.scheme}-{ps.parameterset}
							</a>
							<SecurityBadge broken={ps.broken} warning={ps.warning} info={ps.info} classical={ps.classical} />
						</td>
						<!-- Category -->
						<td class="whitespace-nowrap px-3 py-1.5" title={ps.assumption}>{ps.category}</td>
						<!-- Status -->
						<td class="whitespace-nowrap px-3 py-1.5">{@render statusCell(ps.status, ps.version, ps.scheme)}</td>
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
						{@render detailsCell(`${ps.scheme}-${ps.parameterset}`, ps.scheme)}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-2 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Measured: <a href="https://github.com/mahdi-mysten/pq-sig-bench" target="_blank" rel="noopener noreferrer" class="underline hover:text-pqs-apricot">pq-sig-bench</a>
		through fastcrypto — the stack a Sui validator runs — median of 1000 verify iterations, {hostMeta.machine}.
		Reference: NIST Signatures Zoo benchmark data (Thom Wiggers / PQShield, CC-BY-4.0) — i7-12650H, rdtsc.
	</p>
	<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Details flags:
		<span class="rounded bg-green-100 px-1 text-green-800 dark:bg-green-500/15 dark:text-green-300">strength</span>
		·
		<span class="rounded bg-amber-100 px-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">caveat</span>
		·
		<span class="rounded bg-red-100 px-1 text-red-800 dark:bg-red-500/15 dark:text-red-300">risk</span>
		— hover a flag for the specifics.
	</p>
	<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		Sui validators batch-verify Ed25519 signatures, which roughly halves the amortized per-signature
		cost; none of the PQ candidates support batch verification, so the practical on-chain gap is
		about 2× the vs-Ed25519 column.
	</p>
	<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
		ML-DSA-44 timings are the mean of five independent implementations (libcrux, RustCrypto ml-dsa,
		fips204, PQClean C, aws-lc-rs) — hover the sign/verify cells for the per-implementation spread.
		FN-DSA-512 shows fastcrypto's hand-optimized Rust verifier, with PQClean's deliberately portable
		reference C in parentheses: same math, identical signature bytes — the gap is engineering, not
		algorithm.
	</p>
	<div class="mt-4">
		<h3 class="mb-2 font-heading text-sm font-semibold text-pqs-steel dark:text-pqs-apricot">
			On-chain footprint vs. verify time <span class="font-normal text-pqs-bluegray">(log–log scale)</span>
		</h3>
		<SuiLensPlot {points} />
	</div>
</section>
