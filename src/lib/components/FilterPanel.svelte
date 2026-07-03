<script lang="ts">
	import type { DataRanges, FilterState, NistLevel, Scheme } from '$lib/types';
	import { SELECTABLE_LEVELS } from '$lib/data';
	import { getFilterStore } from '$lib/filterStore';
	import RangeField from './RangeField.svelte';

	interface Props {
		schemes: Scheme[];
		categories: string[];
		ranges: DataRanges;
	}
	let { schemes, categories, ranges }: Props = $props();

	const { store, defaults } = getFilterStore();

	const schemesByCategory = $derived(
		Object.fromEntries(
			categories.map((cat) => [cat, schemes.filter((s) => s.category === cat)])
		)
	);

	function categoryState(cat: string): 'all' | 'some' | 'none' {
		const catSchemes = schemesByCategory[cat];
		const n = catSchemes.filter((s) => $store.schemes.has(s.scheme)).length;
		if (n === catSchemes.length) return 'all';
		if (n === 0) return 'none';
		return 'some';
	}

	function toggleCategory(cat: string) {
		const catSchemes = schemesByCategory[cat].map((s) => s.scheme);
		const state = categoryState(cat);
		const next = new Set($store.schemes);
		if (state === 'all') {
			catSchemes.forEach((s) => next.delete(s));
		} else {
			catSchemes.forEach((s) => next.add(s));
		}
		store.update((f) => ({ ...f, schemes: next }));
	}

	function toggleScheme(scheme: string) {
		const next = new Set($store.schemes);
		if (next.has(scheme)) next.delete(scheme);
		else next.add(scheme);
		store.update((f) => ({ ...f, schemes: next }));
	}

	function toggleLevel(level: NistLevel) {
		const next = new Set($store.levels);
		if (next.has(level)) next.delete(level);
		else next.add(level);
		store.update((f) => ({ ...f, levels: next }));
	}

	function selectAll() {
		store.update((f) => ({ ...f, schemes: new Set(defaults.schemes) }));
	}

	function selectNone() {
		store.update((f) => ({ ...f, schemes: new Set() }));
	}

	function indeterminate(el: HTMLInputElement, value: boolean) {
		el.indeterminate = value;
		return {
			update(v: boolean) {
				el.indeterminate = v;
			},
		};
	}
</script>

<aside class="rounded border border-pqs-ashgray bg-white p-4 text-sm shadow-sm dark:border-pqs-steel dark:bg-pqs-midnight-mid">
	<h2 class="mb-4 font-heading text-base font-bold text-pqs-midnight dark:text-white">Filters</h2>

	<!-- Size filters -->
	<section class="mb-5">
		<h3 class="mb-1 font-heading text-xs font-semibold uppercase tracking-wider text-pqs-steel dark:text-pqs-apricot">
			Key &amp; signature sizes
		</h3>
		<p class="mb-2 text-[11px] leading-snug text-pqs-steel/60 dark:text-pqs-bluegray/60">
			Bytes — the public key is stored once, the signature ships with every transaction.
		</p>
		<div class="space-y-2">
			<RangeField label="pk at least" value={$store.minPk} onchange={(v) => store.update((f) => ({ ...f, minPk: v }))} />
			<RangeField label="pk at most" value={$store.maxPk} onchange={(v) => store.update((f) => ({ ...f, maxPk: v }))} />
			<RangeField label="sig at least" value={$store.minSig} onchange={(v) => store.update((f) => ({ ...f, minSig: v }))} />
			<RangeField label="sig at most" value={$store.maxSig} onchange={(v) => store.update((f) => ({ ...f, maxSig: v }))} />
			<RangeField label="pk+sig at least" value={$store.minPkPlusSig} onchange={(v) => store.update((f) => ({ ...f, minPkPlusSig: v }))} />
			<RangeField label="pk+sig at most" value={$store.maxPkPlusSig} onchange={(v) => store.update((f) => ({ ...f, maxPkPlusSig: v }))} />
		</div>
	</section>

	<hr class="mb-4 border-pqs-ashgray dark:border-pqs-steel" />

	<!-- Level filters -->
	<section class="mb-5">
		<h3 class="mb-1 font-heading text-xs font-semibold uppercase tracking-wider text-pqs-steel dark:text-pqs-apricot">
			Security level
		</h3>
		<p class="mb-2 text-[11px] leading-snug text-pqs-steel/60 dark:text-pqs-bluegray/60">
			NIST levels 1 and 2 only — the sets a chain would deploy. N/A marks the pre-quantum baselines.
		</p>
		<div class="space-y-0.5">
			{#each SELECTABLE_LEVELS as level}
				<label class="flex cursor-pointer items-center gap-1.5">
					<input
						type="checkbox"
						checked={$store.levels.has(level)}
						onchange={() => toggleLevel(level)}
						class="accent-pqs-apricot"
					/>
					<span class="text-pqs-steel dark:text-pqs-bluegray">
						{level === 'Pre-Quantum' ? 'N/A (pre-quantum)' : `Level ${level}`}
					</span>
				</label>
			{/each}
		</div>
	</section>

	<hr class="mb-4 border-pqs-ashgray dark:border-pqs-steel" />

	<!-- Performance filters -->
	<section class="mb-5">
		<h3 class="mb-1 font-heading text-xs font-semibold uppercase tracking-wider text-pqs-steel dark:text-pqs-apricot">
			Speed (CPU cycles)
		</h3>
		<p class="mb-2 text-[11px] leading-snug text-pqs-steel/60 dark:text-pqs-bluegray/60">
			Lower is faster — verify runs on every validator for every transaction.
		</p>
		<div class="space-y-2">
			<RangeField label="sign at least" value={$store.minSigningCycles} onchange={(v) => store.update((f) => ({ ...f, minSigningCycles: v }))} />
			<RangeField label="sign at most" value={$store.maxSigningCycles} onchange={(v) => store.update((f) => ({ ...f, maxSigningCycles: v }))} />
			<RangeField label="verify at least" value={$store.minVerificationCycles} onchange={(v) => store.update((f) => ({ ...f, minVerificationCycles: v }))} />
			<RangeField label="verify at most" value={$store.maxVerificationCycles} onchange={(v) => store.update((f) => ({ ...f, maxVerificationCycles: v }))} />
		</div>
	</section>

	{#if ranges.signingUs || ranges.verificationUs}
		<hr class="mb-4 border-pqs-ashgray dark:border-pqs-steel" />

		<section class="mb-5">
			<!-- Spelled out because the heading is CSS-uppercased and µ capitalizes to Μ (reads as "MS") -->
			<h3 class="mb-1 font-heading text-xs font-semibold uppercase tracking-wider text-pqs-steel dark:text-pqs-apricot">
				Speed (microseconds)
			</h3>
			<p class="mb-2 text-[11px] leading-snug text-pqs-steel/60 dark:text-pqs-bluegray/60">
				Wall-clock times, for schemes that report µs instead of cycles.
			</p>
			<div class="space-y-2">
				{#if ranges.signingUs}
					<RangeField label="sign at least" value={$store.minSigningUs} onchange={(v) => store.update((f) => ({ ...f, minSigningUs: v }))} />
					<RangeField label="sign at most" value={$store.maxSigningUs} onchange={(v) => store.update((f) => ({ ...f, maxSigningUs: v }))} />
				{/if}
				{#if ranges.verificationUs}
					<RangeField label="verify at least" value={$store.minVerificationUs} onchange={(v) => store.update((f) => ({ ...f, minVerificationUs: v }))} />
					<RangeField label="verify at most" value={$store.maxVerificationUs} onchange={(v) => store.update((f) => ({ ...f, maxVerificationUs: v }))} />
				{/if}
			</div>
		</section>
	{/if}

	<hr class="mb-4 border-pqs-ashgray dark:border-pqs-steel" />

	<!-- Scheme picker: name-based, so it sits after the column-value filters above -->
	<section>
		<div class="mb-2 flex items-center justify-between">
			<h3 class="font-heading text-xs font-semibold uppercase tracking-wider text-pqs-steel dark:text-pqs-apricot">
				Schemes
			</h3>
			<span class="space-x-2 font-heading text-xs">
				<button onclick={selectAll} class="text-pqs-apricot underline hover:no-underline">All</button>
				<button onclick={selectNone} class="text-pqs-apricot underline hover:no-underline">None</button>
			</span>
		</div>
		{#each categories as cat}
			<details class="mb-1" open>
				<summary class="flex cursor-pointer list-none items-center gap-1.5 py-0.5">
					<input
						type="checkbox"
						checked={categoryState(cat) !== 'none'}
						use:indeterminate={categoryState(cat) === 'some'}
						onchange={() => toggleCategory(cat)}
						class="shrink-0 accent-pqs-apricot"
					/>
					<span class="font-heading font-semibold text-pqs-midnight dark:text-pqs-smoke">{cat}</span>
				</summary>
				<div class="ml-5 mt-0.5 space-y-0.5">
					{#each schemesByCategory[cat] as scheme}
						<label class="flex cursor-pointer items-center gap-1.5">
							<input
								type="checkbox"
								checked={$store.schemes.has(scheme.scheme)}
								onchange={() => toggleScheme(scheme.scheme)}
								class="shrink-0 accent-pqs-apricot"
							/>
							<span class="text-pqs-steel dark:text-pqs-bluegray">{scheme.scheme}</span>
						</label>
					{/each}
				</div>
			</details>
		{/each}
	</section>
</aside>
