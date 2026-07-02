<script module lang="ts">
	export interface LensPoint {
		label: string;
		pk: number;
		sig: number;
		pkPlusSig: number;
		verifyUs: number;
		source: 'Mysten measured' | 'Zoo reference';
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { themeStore } from '$lib/themeStore';

	let { points }: { points: LensPoint[] } = $props();

	let container = $state<HTMLDivElement | null>(null);
	let viewHandle: { finalize(): void } | null = null;
	let renderSeq = 0;

	async function render() {
		if (!container) return;
		const seq = ++renderSeq;

		const { default: embed } = await import('vega-embed');
		const isDark = document.documentElement.classList.contains('dark');

		const values = points.map((p) => ({
			...p,
			tooltip: {
				Scheme: p.label,
				Source: p.source,
				'pk (bytes)': p.pk.toLocaleString(),
				'sig (bytes)': p.sig.toLocaleString(),
				'pk+sig (bytes)': p.pkPlusSig.toLocaleString(),
				'Verify (µs)': p.verifyUs.toLocaleString(undefined, { maximumFractionDigits: 1 }),
			},
		}));

		const sourceDomain = ['Mysten measured', 'Zoo reference'];
		// Apricot = our numbers, muted steel/bluegray = the zoo's i7 numbers, matching
		// the table's visual split so the two never read as one benchmark.
		const sourceColors = isDark ? ['#f0ab55', '#94A3B8'] : ['#E09434', '#064058'];

		const legendConfig = {
			labelColor: isDark ? '#94A3B8' : '#475569',
			titleColor: isDark ? '#C5CADA' : '#061128',
			strokeColor: 'transparent',
			padding: 8,
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const spec: any = {
			$schema: 'https://vega.github.io/schema/vega-lite/v6.json',
			width: 'container',
			height: 320,
			autosize: { type: 'fit-x', resize: true },
			data: { values },
			layer: [
				{
					mark: { type: 'point', filled: true, size: 130 },
					encoding: {
						// Shape doubles the colour split so the two sources stay
						// distinguishable for colour-blind readers.
						shape: {
							field: 'source',
							type: 'nominal',
							scale: { domain: sourceDomain, range: ['circle', 'diamond'] },
							legend: null,
						},
						color: {
							field: 'source',
							type: 'nominal',
							scale: { domain: sourceDomain, range: sourceColors },
							legend: { title: 'Source', ...legendConfig },
						},
					},
				},
				{
					mark: {
						type: 'text',
						dy: -12,
						fontSize: 10,
						font: 'Karla, sans-serif',
						color: isDark ? '#C5CADA' : '#475569',
					},
					encoding: {
						text: { field: 'label', type: 'nominal' },
					},
				},
			],
			encoding: {
				x: {
					field: 'pkPlusSig',
					type: 'quantitative',
					scale: { type: 'log' },
					axis: { title: 'pk + sig (bytes)', grid: true, format: 's' },
				},
				y: {
					field: 'verifyUs',
					type: 'quantitative',
					scale: { type: 'log' },
					axis: { title: 'Verify (µs)', grid: true, format: 's' },
				},
				tooltip: { field: 'tooltip', type: 'nominal' },
			},
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
		points;
		$themeStore;
		render();
	});
</script>

<div bind:this={container} class="w-full"></div>
