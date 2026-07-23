<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import BenchmarkEnvInfo from '$lib/components/BenchmarkEnvInfo.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import SignVsSigPlot from '$lib/components/SignVsSigPlot.svelte';
	import SchemeTable from '$lib/components/SchemeTable.svelte';
	import ScatterPlot from '$lib/components/ScatterPlot.svelte';
	import SuiLens from '$lib/components/SuiLens.svelte';
	import { processYamlSchemes } from '$lib/data';
	import { getFilterStore, buildUrlParams } from '$lib/filterStore';
	import { allSchemeData, benchmarkEnv, lastUpdated } from '$lib/schemeData';

	// Dataset is pinned to the round-3 survivors at their latest specs (the old
	// round selector is gone) — matches what +page.ts fed the filter store.
	const { schemes, ranges } = processYamlSchemes(allSchemeData, 'round-3', { useLatestVersion: true });
	const categories = [...new Set(schemes.map((s) => s.category))].sort();

	const { applyUrl } = getFilterStore();

	onMount(() => {
		// Apply filter URL params
		const params = new URLSearchParams(window.location.search);
		if (params.toString()) applyUrl(params);

		// Debounced URL sync on filter changes
		let urlSyncTimer: ReturnType<typeof setTimeout> | null = null;
		const { store, defaults } = getFilterStore();
		const unsubFilter = store.subscribe((state) => {
			if (urlSyncTimer) clearTimeout(urlSyncTimer);
			urlSyncTimer = setTimeout(() => {
				const p = buildUrlParams(state, defaults);
				const qs = p.toString();
				const newUrl = qs ? `?${qs}` : $page.url.pathname;
				goto(newUrl, { replaceState: true, keepFocus: true, noScroll: true });
			}, 300);
		});

		return () => {
			unsubFilter();
			if (urlSyncTimer) clearTimeout(urlSyncTimer);
		};
	});
</script>

<div class="mx-auto max-w-screen-2xl px-6 py-8">
	<!-- Hero header -->
	<div class="mb-8 border-l-4 border-pqs-apricot pl-4">
		<h1 class="font-heading text-3xl font-bold text-pqs-midnight dark:text-white">
			Post-Quantum Signature Schemes
		</h1>
		<p class="mt-2 text-sm text-pqs-steel dark:text-pqs-bluegray">
			Comparing NIST on-ramp candidates and standardized schemes, curated for Sui's PQ-authenticator
			decision: every parameter set is listed, at every NIST security level. Click column headers to
			sort. Use the filters to narrow down by category, security level, or size constraints.
		</p>
		<p class="mt-1.5 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
			Data reflects the latest known specifications for each scheme, last updated {lastUpdated}.
			Consult the individual scheme websites for the most current information.
		</p>
	</div>

	<!-- Sui on-chain lens: our measured numbers, independent of the round selector -->
	<div class="mb-8">
		<SuiLens />
	</div>

	<div class="flex gap-8">
		<!-- Sidebar filter panel -->
		<div class="hidden w-60 shrink-0 lg:block">
			<div class="sticky top-4">
				<FilterPanel schemes={schemes} categories={categories} ranges={ranges} />
			</div>
		</div>

		<!-- Main content -->
		<div class="min-w-0 flex-1 space-y-6">
			<!-- Mobile filter disclosure -->
			<details class="lg:hidden">
				<summary class="cursor-pointer rounded border border-pqs-bluegray bg-white px-3 py-2 font-heading text-sm font-semibold text-pqs-steel dark:border-pqs-steel dark:bg-pqs-midnight-mid dark:text-pqs-apricot">
					Filters ▼
				</summary>
				<div class="mt-2 rounded border border-pqs-ashgray bg-white p-3 dark:border-pqs-steel dark:bg-pqs-midnight-mid">
					<FilterPanel schemes={schemes} categories={categories} ranges={ranges} />
				</div>
			</details>

			<!-- Wallet cost vs on-chain cost, for the schemes we measured ourselves -->
			<section class="rounded border border-pqs-ashgray bg-white p-4 shadow-sm dark:border-pqs-steel dark:bg-pqs-midnight-mid">
				<h2 class="mb-3 font-heading text-base font-semibold text-pqs-steel dark:text-pqs-apricot">
					Sign time vs. pk+sig size <span class="font-normal text-pqs-bluegray">(log–log scale)</span>
				</h2>
				<SignVsSigPlot />
			</section>

			<!-- Scatter plot -->
			<section class="rounded border border-pqs-ashgray bg-white p-4 shadow-sm dark:border-pqs-steel dark:bg-pqs-midnight-mid">
				<h2 class="mb-3 font-heading text-base font-semibold text-pqs-steel dark:text-pqs-apricot">
					pk size vs. sig size <span class="font-normal text-pqs-bluegray">(log–log scale)</span>
				</h2>
				<ScatterPlot />
				<div class="mt-2 flex justify-end">
					<a href="{base}/advanced/" class="text-xs text-pqs-bluegray hover:text-pqs-apricot dark:text-pqs-steel dark:hover:text-pqs-apricot transition-colors">
						Advanced graph →
					</a>
				</div>
			</section>

			<!-- Performance disclaimer -->
			<div class="rounded border border-pqs-apricot/40 bg-pqs-apricot/10 px-4 py-3 text-xs text-pqs-midnight dark:border-pqs-apricot/30 dark:bg-pqs-apricot/5 dark:text-pqs-smoke">
				<strong class="font-heading font-semibold text-pqs-apricot">Performance note:</strong>
				Cycle counts are from our own benchmarks on a {benchmarkEnv?.cpu.model ?? 'reference machine'} —
				see the environment details below.
			</div>

			<!-- Unified table -->
			<section>
				<SchemeTable />
			</section>

			<!-- Benchmark environment -->
			{#if benchmarkEnv}
				<BenchmarkEnvInfo env={benchmarkEnv} />
			{/if}
		</div>
	</div>
</div>
