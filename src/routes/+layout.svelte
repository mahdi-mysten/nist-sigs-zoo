<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { SUI_IMPACT } from '$lib/flags';
	import { themeStore } from '$lib/themeStore';
	import { lastUpdated } from '$lib/schemeData';

	let { children } = $props();

	const themeIcon = $derived(
		$themeStore === 'dark' ? '🌙' : $themeStore === 'light' ? '☀️' : '🖥️'
	);
	const themeLabel = $derived(`Theme: ${$themeStore} — click to cycle`);

	let menuOpen = $state(false);

	onMount(() => {
		themeStore.init();
	});

	function closeMenu() {
		menuOpen = false;
	}
</script>

<div class="flex min-h-screen flex-col bg-pqs-smoke text-pqs-midnight dark:bg-pqs-midnight dark:text-pqs-smoke">
	<header class="bg-pqs-midnight shadow-md">
		<nav class="mx-auto flex max-w-screen-2xl items-center gap-6 px-6 py-4">
			<a href="{base}/" class="flex items-center gap-2 text-white" onclick={closeMenu}>
				<span class="font-heading text-xl font-bold tracking-tight">Mysten</span>
				<span class="rounded bg-pqs-apricot px-2 py-0.5 font-heading text-xs font-semibold text-pqs-midnight">
					PQ Signatures Zoo
				</span>
			</a>

			<!-- Desktop nav -->
			<div class="ml-auto hidden items-center gap-5 font-heading text-sm md:flex">
				{#if SUI_IMPACT}
					<a href="{base}/impact/" class="text-pqs-bluegray hover:text-pqs-apricot transition-colors">
						Sui impact
					</a>
				{/if}
				<a href="{base}/history/" class="text-pqs-bluegray hover:text-pqs-apricot transition-colors">
					History
				</a>
				<a
					href="https://github.com/pqshield/nist-sigs-zoo"
					target="_blank"
					rel="noopener noreferrer"
					class="text-pqs-bluegray hover:text-pqs-apricot transition-colors"
				>
					Upstream ↗
				</a>
				<button
					onclick={() => themeStore.toggle()}
					aria-label={themeLabel}
					title={themeLabel}
					class="rounded px-2 py-1 text-base text-pqs-bluegray hover:text-white hover:bg-pqs-steel transition-colors"
				>
					{themeIcon}
				</button>
			</div>

			<!-- Mobile: theme toggle always visible + hamburger -->
			<div class="ml-auto flex items-center gap-2 md:hidden">
				<button
					onclick={() => themeStore.toggle()}
					aria-label={themeLabel}
					title={themeLabel}
					class="rounded px-2 py-1 text-base text-pqs-bluegray hover:text-white hover:bg-pqs-steel transition-colors"
				>
					{themeIcon}
				</button>
				<button
					onclick={() => (menuOpen = !menuOpen)}
					aria-label="Toggle menu"
					aria-expanded={menuOpen}
					class="rounded p-1.5 text-pqs-bluegray hover:text-white hover:bg-pqs-steel transition-colors"
				>
					{#if menuOpen}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
						</svg>
					{/if}
				</button>
			</div>
		</nav>

		<!-- Mobile dropdown -->
		{#if menuOpen}
			<div class="border-t border-pqs-steel/30 px-6 pb-4 pt-3 font-heading text-sm md:hidden">
				<div class="flex flex-col gap-3">
					{#if SUI_IMPACT}
						<a href="{base}/impact/" onclick={closeMenu} class="text-pqs-bluegray hover:text-pqs-apricot transition-colors">
							Sui impact
						</a>
					{/if}
					<a href="{base}/history/" onclick={closeMenu} class="text-pqs-bluegray hover:text-pqs-apricot transition-colors">
						History
					</a>
					<a
						href="https://github.com/pqshield/nist-sigs-zoo"
						target="_blank"
						rel="noopener noreferrer"
						onclick={closeMenu}
						class="text-pqs-bluegray hover:text-pqs-apricot transition-colors"
					>
						Upstream ↗
					</a>
				</div>
			</div>
		{/if}
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="mt-8 border-t border-pqs-bluegray/30 bg-pqs-midnight px-6 py-6 text-xs text-pqs-bluegray dark:border-pqs-steel">
		<div class="mx-auto max-w-screen-2xl space-y-1">
			<p>
				A Mysten Labs fork of the PQShield NIST Signatures Zoo (Thom Wiggers) &mdash; upstream data CC-BY-4.0,
				<a
					href="https://github.com/PQShield/nist-sigs-zoo"
					target="_blank"
					rel="noopener noreferrer"
					class="text-pqs-apricot hover:underline">https://github.com/PQShield/nist-sigs-zoo</a
				>.
			</p>
			<p>
				Data licensed under
				<a href="{base}/LICENSE.md" class="text-pqs-apricot hover:underline">CC BY-SA 4.0</a>.
				Most recent scheme data is dated {lastUpdated}.
			</p>
		</div>
	</footer>
</div>
