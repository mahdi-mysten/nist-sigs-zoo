<script lang="ts">
	import { base } from '$app/paths';
	import SuiImpact from '$lib/components/SuiImpact.svelte';
	import { SUI_IMPACT } from '$lib/flags';
	import { MYSTEN_HOSTS } from '$lib/mystenBenchData';
	import { suiHost } from '$lib/suiHostStore';
</script>

<svelte:head>
	<title>Sui impact — Mysten PQ Signatures Zoo</title>
</svelte:head>

<div class="mx-auto max-w-screen-2xl px-6 py-8">
	{#if SUI_IMPACT}
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 class="font-heading text-2xl font-bold text-pqs-midnight dark:text-white">Sui impact</h1>
				<p class="mt-1 text-sm text-pqs-steel dark:text-pqs-bluegray">
					What each PQ scheme would do to Sui throughput and finality.
					Verify medians come from the <a href="{base}/" class="text-pqs-apricot hover:underline">measured bench</a>.
				</p>
			</div>

			<!-- The main page's host toggle lives in the lens; this page needs its own. -->
			<div class="flex rounded border border-pqs-ashgray dark:border-pqs-steel overflow-hidden shrink-0">
				{#each MYSTEN_HOSTS as h}
					<button
						onclick={() => suiHost.set(h.id)}
						class="px-3 py-1.5 text-xs font-heading transition-colors {$suiHost === h.id
							? 'bg-pqs-apricot text-pqs-midnight font-semibold'
							: 'bg-white text-pqs-bluegray hover:text-pqs-midnight dark:bg-pqs-midnight-mid dark:text-pqs-steel dark:hover:text-white'}"
					>
						{h.label}
					</button>
				{/each}
			</div>
		</div>

		<SuiImpact />
	{:else}
		<h1 class="font-heading text-2xl font-bold text-pqs-midnight dark:text-white">Sui impact</h1>
		<p class="mt-2 text-sm text-pqs-steel dark:text-pqs-bluegray">
			This page is not enabled in this build. Set <code class="font-mono">PUBLIC_SUI_IMPACT=true</code>
			in <code class="font-mono">.env</code> and rebuild to turn it on.
		</p>
		<a href="{base}/" class="mt-4 inline-block text-sm text-pqs-apricot hover:underline">← Back to the zoo</a>
	{/if}
</div>
