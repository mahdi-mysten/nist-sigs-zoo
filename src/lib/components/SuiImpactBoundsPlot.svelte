<script module lang="ts">
	export interface BoundBar {
		/** Display label, one of BOUND_LABELS' values. */
		bound: string;
		scenarioTps: number;
		baselineTps: number;
		/** True on the bound that is the current min — drawn in apricot. */
		binding: boolean;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { themeStore } from '$lib/themeStore';

	let { bars }: { bars: BoundBar[] } = $props();

	let container = $state<HTMLDivElement | null>(null);
	let viewHandle: { finalize(): void } | null = null;
	let renderSeq = 0;

	async function render() {
		if (!container || bars.length === 0) return;
		const seq = ++renderSeq;

		const { default: embed } = await import('vega-embed');
		const isDark = document.documentElement.classList.contains('dark');

		const values = bars.map((b) => ({
			bound: b.bound,
			scenario: b.scenarioTps,
			baseline: b.baselineTps,
			role: b.binding ? 'binding' : 'slack',
			label: Math.round(b.scenarioTps).toLocaleString(),
			tooltip: {
				Bound: b.bound,
				'This scenario (TPS)': Math.round(b.scenarioTps).toLocaleString(),
				'Ed25519-only (TPS)': Math.round(b.baselineTps).toLocaleString(),
				Binding: b.binding ? 'yes, this is the min' : 'no',
			},
		}));

		// One shared log domain for scenario + ghost bars; padded so end-of-bar
		// value labels stay inside the plot.
		const all = bars.flatMap((b) => [b.scenarioTps, b.baselineTps]);
		const domainMin = Math.min(...all) / 2;
		const xScale = {
			type: 'log',
			nice: false,
			domain: [domainMin, Math.max(...all) * 4],
		};
		const boundOrder = bars.map((b) => b.bound);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const spec: any = {
			$schema: 'https://vega.github.io/schema/vega-lite/v6.json',
			width: 'container',
			height: 170,
			autosize: { type: 'fit-x', resize: true },
			data: { values },
			encoding: {
				y: {
					field: 'bound',
					type: 'nominal',
					sort: boundOrder,
					axis: { title: null, labelLimit: 200, labelFontSize: 11 },
				},
				tooltip: { field: 'tooltip', type: 'nominal' },
			},
			layer: [
				{
					// Ed25519-only baseline, ghosted behind the scenario bar.
					mark: { type: 'bar', height: 24, opacity: 0.28, color: isDark ? '#94A3B8' : '#64748B' },
					encoding: {
						x: { field: 'baseline', type: 'quantitative', scale: xScale },
						// A log scale has no zero baseline for bars to grow from, so
						// anchor them at the domain edge explicitly or nothing renders.
						x2: { datum: domainMin },
					},
				},
				{
					mark: { type: 'bar', height: 11 },
					encoding: {
						x: {
							field: 'scenario',
							type: 'quantitative',
							scale: xScale,
							axis: { title: 'transactions per second (log)', grid: true, format: 's' },
						},
						x2: { datum: domainMin },
						color: {
							field: 'role',
							type: 'nominal',
							// Apricot marks the binding bound, steel the ones with slack —
							// the same highlight/rest split the lens plot uses.
							scale: {
								domain: ['binding', 'slack'],
								range: isDark ? ['#f0ab55', '#5b7c95'] : ['#E09434', '#064058'],
							},
							legend: null,
						},
					},
				},
				{
					mark: {
						type: 'text',
						align: 'left',
						dx: 5,
						fontSize: 10,
						font: 'Karla, sans-serif',
						color: isDark ? '#C5CADA' : '#475569',
					},
					encoding: {
						x: { field: 'scenario', type: 'quantitative', scale: xScale },
						text: { field: 'label' },
					},
				},
			],
			config: {
				background: 'transparent',
				axis: {
					gridColor: isDark ? '#334155' : '#E2E8F0',
					tickColor: isDark ? '#475569' : '#94A3B8',
					labelColor: isDark ? '#94A3B8' : '#475569',
					titleColor: isDark ? '#C5CADA' : '#061128',
					domainColor: isDark ? '#475569' : '#94A3B8',
				},
				view: { stroke: 'transparent' },
			},
		};

		viewHandle?.finalize();
		const result = await embed(container, spec, { actions: false, renderer: 'svg' });
		if (seq !== renderSeq) {
			result.finalize();
			return;
		}
		viewHandle = result;
	}

	onMount(() => {
		return () => viewHandle?.finalize();
	});

	$effect(() => {
		bars;
		$themeStore;
		render();
	});
</script>

<div bind:this={container} class="w-full"></div>
