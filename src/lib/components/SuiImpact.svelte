<script lang="ts">
	import { fmt } from '$lib/format';
	import {
		BOUND_LABELS,
		IMPACT_PRESETS,
		adoptionSweep,
		clampAssumptions,
		computeImpact,
		ed25519Baseline,
		envelopeBytes,
		tpsBucket,
		type ImpactAssumptions,
	} from '$lib/impactModel';
	import { mystenBench, MYSTEN_HOSTS } from '$lib/mystenBenchData';
	import { suiHost } from '$lib/suiHostStore';
	import { BUCKET_CLASSES } from '$lib/trafficLight';
	import SuiImpactBoundsPlot, { type BoundBar } from './SuiImpactBoundsPlot.svelte';
	import SuiImpactSweepPlot, { type SweepDatum } from './SuiImpactSweepPlot.svelte';

	// Scheme list and envelope sizes are pinned by the Mac run (sizes are
	// host-independent); the host toggle up in the lens swaps which run supplies
	// verify medians. Ed25519 is the mixed-in remainder, not a scenario, and
	// PQClean C is the same Falcon verifier so it gets no scenario either.
	const EXCLUDED = new Set(['Ed25519', 'Falcon-512 (PQClean C)']);
	const schemeRows = mystenBench['mac-m2-max'].filter((r) => !EXCLUDED.has(r.name));

	let schemeName = $state('ML-DSA-44');
	let adoptionPct = $state(100);
	// Raw panel values; clampAssumptions() guards against cleared inputs (NaN)
	// before anything reaches the model.
	let raw = $state<ImpactAssumptions>({ ...IMPACT_PRESETS[0].assumptions });

	const assumptions = $derived(clampAssumptions(raw));
	const activePreset = $derived(
		IMPACT_PRESETS.find((p) =>
			(Object.keys(p.assumptions) as (keyof ImpactAssumptions)[]).every(
				(k) => p.assumptions[k] === assumptions[k]
			)
		) ?? null
	);

	const hostMeta = $derived(MYSTEN_HOSTS.find((h) => h.id === $suiHost)!);
	const verifyUsByName = $derived(
		new Map(
			mystenBench[$suiHost].flatMap((r) =>
				r.verifyNs == null ? [] : [[r.name, r.verifyNs / 1000] as const]
			)
		)
	);

	const schemeRow = $derived(schemeRows.find((r) => r.name === schemeName)!);
	const schemeEnvBytes = $derived(envelopeBytes(schemeRow.pkLen, schemeRow.sigLen));
	const schemeVerifyUs = $derived(verifyUsByName.get(schemeName));
	const edVerifyUs = $derived(verifyUsByName.get('Ed25519'));
	const ready = $derived(schemeVerifyUs != null && edVerifyUs != null);

	const result = $derived(
		ready
			? computeImpact(
					{
						verifyUs: schemeVerifyUs!,
						envelopeBytes: schemeEnvBytes,
						adoption: adoptionPct / 100,
						ed25519VerifyUs: edVerifyUs!,
					},
					assumptions
				)
			: null
	);
	const baseline = $derived(ready ? ed25519Baseline(edVerifyUs!, assumptions) : null);
	const deltaPct = $derived(
		result && baseline ? (result.effectiveTps / baseline.effectiveTps - 1) * 100 : 0
	);
	const bucket = $derived(
		result && baseline ? tpsBucket(result.effectiveTps, baseline.effectiveTps) : 'green'
	);

	const bars = $derived<BoundBar[]>(
		result && baseline
			? [
					{
						bound: BOUND_LABELS.verify,
						scenarioTps: result.verifyBoundTps,
						baselineTps: baseline.verifyBoundTps,
						binding: result.binding === 'verify',
					},
					{
						bound: BOUND_LABELS.bandwidth,
						scenarioTps: result.bandwidthBoundTps,
						baselineTps: baseline.bandwidthBoundTps,
						binding: result.binding === 'bandwidth',
					},
					{
						bound: BOUND_LABELS.ceiling,
						scenarioTps: result.ceilingTps,
						baselineTps: baseline.ceilingTps,
						binding: result.binding === 'ceiling',
					},
				]
			: []
	);

	const sweep = $derived<SweepDatum[]>(
		ready
			? adoptionSweep(
					{ verifyUs: schemeVerifyUs!, envelopeBytes: schemeEnvBytes },
					edVerifyUs!,
					assumptions
				).map((p) => ({
					adoptionPct: p.adoption * 100,
					effectiveTps: p.effectiveTps,
					bound: BOUND_LABELS[p.binding],
				}))
			: []
	);

	function usePreset(id: string) {
		raw = { ...IMPACT_PRESETS.find((p) => p.id === id)!.assumptions };
	}

	const fmtTps = (n: number) => fmt(Math.round(n));
	const fmtDelta = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%`;

	const inputClass =
		'mt-1 w-full rounded border border-pqs-ashgray bg-white px-2 py-1 text-sm tabular-nums ' +
		'text-pqs-midnight dark:border-pqs-steel dark:bg-pqs-midnight dark:text-pqs-smoke';
	const hintClass = 'mt-1 block text-[11px] leading-snug text-pqs-steel/60 dark:text-pqs-bluegray/60';
	const cardClass = 'rounded border border-pqs-ashgray p-3 dark:border-pqs-steel';
	const cardTitleClass =
		'font-heading text-xs font-semibold uppercase tracking-wide text-pqs-steel/70 dark:text-pqs-bluegray/70';
</script>

<section class="rounded border border-pqs-apricot/60 bg-white p-4 shadow-sm dark:border-pqs-apricot/40 dark:bg-pqs-midnight-mid">
	<h2 class="font-heading text-xl font-bold text-pqs-midnight dark:text-white">
		What PQ signatures do to the chain
	</h2>
	<p class="mt-1 text-xs text-pqs-steel dark:text-pqs-bluegray">
		A model, not a measurement: throughput as the smallest of three capacity bounds, fed by the
		verify medians above ({hostMeta.machine}) and published testbed constants.
	</p>

	<!-- Controls: scheme, adoption, presets -->
	<div class="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
		<label class="block text-xs font-heading font-semibold text-pqs-steel dark:text-pqs-bluegray">
			Scheme
			<select
				bind:value={schemeName}
				class="mt-1 block rounded border border-pqs-ashgray bg-white px-2 py-1.5 font-mono text-xs font-normal text-pqs-midnight dark:border-pqs-steel dark:bg-pqs-midnight dark:text-pqs-smoke"
			>
				{#each schemeRows as r (r.name)}
					<option value={r.name}>{r.name}</option>
				{/each}
			</select>
		</label>

		<label class="block w-64 max-w-full text-xs font-heading font-semibold text-pqs-steel dark:text-pqs-bluegray">
			PQ adoption: {adoptionPct}% <span class="font-normal text-pqs-steel/60 dark:text-pqs-bluegray/60">(rest stays Ed25519)</span>
			<input
				id="adoption-slider"
				type="range"
				min="0"
				max="100"
				step="1"
				bind:value={adoptionPct}
				class="mt-2 block w-full accent-pqs-apricot"
			/>
		</label>

		<div class="flex overflow-hidden rounded border border-pqs-ashgray dark:border-pqs-steel">
			{#each IMPACT_PRESETS as p (p.id)}
				<button
					onclick={() => usePreset(p.id)}
					title={p.note}
					class="px-3 py-1.5 text-xs font-heading transition-colors {activePreset?.id === p.id
						? 'bg-pqs-apricot text-pqs-midnight font-semibold'
						: 'bg-white text-pqs-bluegray hover:text-pqs-midnight dark:bg-pqs-midnight-mid dark:text-pqs-steel dark:hover:text-white'}"
				>
					{p.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Assumptions panel: every constant in the model, editable -->
	<details class="mt-3 rounded border border-pqs-ashgray dark:border-pqs-steel">
		<summary class="cursor-pointer px-3 py-2 font-heading text-xs font-semibold text-pqs-steel dark:text-pqs-apricot">
			Assumptions {activePreset ? `(${activePreset.label})` : '(custom)'}
		</summary>
		<div class="grid gap-x-6 gap-y-4 border-t border-pqs-ashgray p-3 text-xs text-pqs-steel sm:grid-cols-2 xl:grid-cols-3 dark:border-pqs-steel dark:text-pqs-bluegray">
			<label class="block">
				<span class="font-heading font-semibold">Verify cores: {assumptions.verifyCores} of 24</span>
				<input type="range" min="1" max="24" step="1" bind:value={raw.verifyCores} class="mt-1 block w-full accent-pqs-apricot" />
				<span class={hintClass}>Cores spent on signature checks; the rest run consensus and execution.</span>
			</label>
			<label class="block">
				<span class="font-heading font-semibold">NIC line rate (Gbit/s)</span>
				<input type="number" min="0.1" step="0.5" bind:value={raw.nicGbps} class={inputClass} />
				<span class={hintClass}>25 in the blog testbed; 1 is the operator-docs minimum.</span>
			</label>
			<label class="block">
				<span class="font-heading font-semibold">NIC share for transactions</span>
				<input type="number" min="0.05" max="1" step="0.05" bind:value={raw.nicUtilization} class={inputClass} />
				<span class={hintClass}>Fraction left for tx dissemination; gossip, checkpoints and sync eat the rest.</span>
			</label>
			<label class="block">
				<span class="font-heading font-semibold">Consensus + execution ceiling (TPS)</span>
				<input type="number" min="1000" step="1000" bind:value={raw.ceilingTps} class={inputClass} />
				<span class={hintClass}>Everything that is neither crypto nor bytes; 297k is the blog best case.</span>
			</label>
			<label class="block">
				<span class="font-heading font-semibold">Baseline finality p50 (ms)</span>
				<input type="number" min="0" step="10" bind:value={raw.finalityMs} class={inputClass} />
				<span class={hintClass}>Uncongested consensus commit latency (~480 ms in the blog run).</span>
			</label>
			<label class="block">
				<span class="font-heading font-semibold">Base tx size (bytes)</span>
				<input type="number" min="1" step="50" bind:value={raw.baseTxBytes} class={inputClass} />
				<span class={hintClass}>Serialized transaction without the user signature envelope.</span>
			</label>
			<label class="block">
				<span class="font-heading font-semibold">Ed25519 batch-verify speedup</span>
				<input type="number" min="1" max="100" step="0.5" bind:value={raw.ed25519BatchFactor} class={inputClass} />
				<span class={hintClass}>Amortized per-signature gain from ed25519-consensus batching. No PQ scheme has a batch verifier; set 1 for the unbatched world.</span>
			</label>
		</div>
	</details>

	{#if !ready || !result || !baseline}
		<p class="mt-4 rounded border border-pqs-apricot/40 bg-pqs-apricot/10 px-3 py-2 text-xs text-pqs-midnight dark:bg-pqs-apricot/5 dark:text-pqs-smoke">
			No measured verify medians for {hostMeta.label} yet, so there is nothing honest to model.
			Import a run with <code class="font-mono">npm run import-bench</code>, or switch the host
			toggle in the lens above.
		</p>
	{:else}
		<!-- Headline cards -->
		<div class="mt-4 grid gap-3 sm:grid-cols-3">
			<div
				class="{cardClass} {BUCKET_CLASSES[bucket]}"
				title="Tint vs the Ed25519-only baseline: green at 90% or more, orange at 50% or more, red below."
			>
				<div class={cardTitleClass}>Effective TPS (modeled)</div>
				<div class="mt-1 font-heading text-2xl font-bold tabular-nums text-pqs-midnight dark:text-white" data-testid="effective-tps">
					{fmtTps(result.effectiveTps)}
				</div>
				<div class="mt-0.5 text-xs text-pqs-steel/80 dark:text-pqs-bluegray/80">
					{fmtDelta(deltaPct)} vs Ed25519-only ({fmtTps(baseline.effectiveTps)})
				</div>
			</div>
			<div class={cardClass}>
				<div class={cardTitleClass}>Binding constraint</div>
				<div class="mt-1 font-heading text-lg font-bold leading-8 text-pqs-midnight dark:text-white" data-testid="binding-bound">
					{BOUND_LABELS[result.binding]}
				</div>
				<div class="mt-0.5 text-xs text-pqs-steel/80 dark:text-pqs-bluegray/80">
					the smallest of the three bounds below
				</div>
			</div>
			<div class={cardClass}>
				<div class={cardTitleClass}>Finality estimate (p50)</div>
				<div class="mt-1 font-heading text-2xl font-bold tabular-nums text-pqs-midnight dark:text-white" data-testid="finality-est">
					{result.finalityMs.toFixed(1)} ms
				</div>
				<div class="mt-0.5 text-xs text-pqs-steel/80 dark:text-pqs-bluegray/80">
					+{Math.round(result.finalityCryptoUs)} µs from crypto: one verify on the critical path
				</div>
			</div>
		</div>

		<!-- Bounds readout: same numbers as chart A, in text -->
		<div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-pqs-steel/80 dark:text-pqs-bluegray/80">
			<span>{BOUND_LABELS.verify}: <strong class="tabular-nums" data-testid="bound-verify">{fmtTps(result.verifyBoundTps)}</strong> TPS</span>
			<span>{BOUND_LABELS.bandwidth}: <strong class="tabular-nums" data-testid="bound-bandwidth">{fmtTps(result.bandwidthBoundTps)}</strong> TPS</span>
			<span>{BOUND_LABELS.ceiling}: <strong class="tabular-nums" data-testid="bound-ceiling">{fmtTps(result.ceilingTps)}</strong> TPS</span>
		</div>

		<!-- Charts -->
		<div class="mt-4 grid gap-6 xl:grid-cols-2">
			<div>
				<h3 class="font-heading text-sm font-semibold text-pqs-steel dark:text-pqs-apricot">
					The three bounds at {adoptionPct}% adoption
				</h3>
				<p class="mb-1 text-[11px] text-pqs-steel/60 dark:text-pqs-bluegray/60">
					Ghost bars: Ed25519-only under the same assumptions. Apricot: the binding bound.
				</p>
				<SuiImpactBoundsPlot {bars} />
			</div>
			<div>
				<h3 class="font-heading text-sm font-semibold text-pqs-steel dark:text-pqs-apricot">
					Effective TPS vs adoption for {schemeName}
				</h3>
				<p class="mb-1 text-[11px] text-pqs-steel/60 dark:text-pqs-bluegray/60">
					Line color: which bound binds. Dashed: Ed25519-only. Vertical mark: the slider.
				</p>
				<SuiImpactSweepPlot points={sweep} baselineTps={baseline.effectiveTps} currentPct={adoptionPct} />
			</div>
		</div>
	{/if}

	<!-- The reasoning, in prose -->
	<div class="mt-4 space-y-1.5 text-xs text-pqs-steel/80 dark:text-pqs-bluegray/80">
		<p>
			Modeled throughput is the smallest of three bounds: signatures the verify cores can check,
			transaction bytes the NIC can move, and a flat ceiling standing in for consensus and
			execution, everything that is neither crypto nor bytes. A faster verifier does not raise
			throughput — at the defaults the ceiling binds first, so Falcon-512's quicker verify buys
			nothing, while slower verification and bigger signatures can drag the chain below it.
			SLH-DSA hurts twice: verification is far slower than batched Ed25519, and its 7.9–17.1 KB
			envelope pulls the bandwidth bound down at the same time.
		</p>
		<p>
			Finality stays consensus-dominated: signature checks add at most one verify to the critical
			path, microseconds against a ~480 ms budget. That holds only below capacity: at offered load
			at or above the effective TPS, queues grow and latency is unbounded. This page models
			capacity, not queueing. The Ed25519 share is credited a flat 2× for batch verification
			(ed25519-consensus) — no PQ scheme has a batch verifier. Set the factor to 1 in the
			assumptions to see the unbatched world, where the baseline itself turns verification-bound.
		</p>
		<p>
			Constants: <a
				href="https://blog.sui.io/sui-performance-update/"
				target="_blank"
				rel="noopener noreferrer"
				class="text-pqs-steel underline decoration-pqs-apricot/60 hover:text-pqs-apricot dark:text-pqs-apricot">Sui performance update</a
			> testbed (100 validators, 24-core AMD, 25 Gbps, 10,871–297,000 TPS by PTB size, ~480 ms p50)
			and the Sui validator operator docs (1 Gbps minimum NIC). Verify medians: our pq-bench run,
			{hostMeta.machine}.
		</p>
	</div>
</section>
