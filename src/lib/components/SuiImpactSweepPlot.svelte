<script module lang="ts">
	export interface SweepDatum {
		adoptionPct: number;
		effectiveTps: number;
		/** Binding-bound display label at this adoption, one of BOUND_LABELS' values. */
		bound: string;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { BOUND_LABELS } from '$lib/impactModel';
	import { themeStore } from '$lib/themeStore';

	let {
		points,
		baselineTps,
		currentPct,
	}: { points: SweepDatum[]; baselineTps: number; currentPct: number } = $props();

	let container = $state<HTMLDivElement | null>(null);
	let viewHandle: { finalize(): void } | null = null;
	let renderSeq = 0;

	async function render() {
		if (!container || points.length === 0) return;
		const seq = ++renderSeq;

		const { default: embed } = await import('vega-embed');
		const isDark = document.documentElement.classList.contains('dark');

		// Colouring the line by binding bound splits it into one series per bound;
		// duplicating each flip point into the next series keeps the drawn line
		// connected across the crossover instead of leaving a one-step gap.
		const stitched: SweepDatum[] = [];
		for (let i = 0; i < points.length; i++) {
			stitched.push(points[i]);
			const next = points[i + 1];
			if (next && next.bound !== points[i].bound) stitched.push({ ...points[i], bound: next.bound });
		}
		const values = stitched.map((p) => ({
			...p,
			tooltip: {
				Adoption: `${p.adoptionPct.toFixed(0)}%`,
				'Effective TPS': Math.round(p.effectiveTps).toLocaleString(),
				'Binding bound': p.bound,
			},
		}));

		const allTps = [...points.map((p) => p.effectiveTps), baselineTps];
		const yScale = {
			type: 'log',
			nice: false,
			domain: [Math.min(...allTps) / 1.6, Math.max(...allTps) * 1.6],
		};

		// Fixed bound → colour mapping so the legend is stable regardless of which
		// bounds actually appear in this sweep.
		const boundDomain = [BOUND_LABELS.verify, BOUND_LABELS.bandwidth, BOUND_LABELS.ceiling];
		const boundColors = isDark
			? ['#f47171', '#7fb2cc', '#f0ab55']
			: ['#ED3232', '#064058', '#E09434'];

		const legendConfig = {
			labelColor: isDark ? '#94A3B8' : '#475569',
			titleColor: isDark ? '#C5CADA' : '#061128',
			strokeColor: 'transparent',
			orient: 'bottom',
			padding: 4,
		};
		const refColor = isDark ? '#94A3B8' : '#64748B';

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const spec: any = {
			$schema: 'https://vega.github.io/schema/vega-lite/v6.json',
			width: 'container',
			height: 210,
			autosize: { type: 'fit-x', resize: true },
			layer: [
				{
					// Ed25519-only reference line.
					data: { values: [{}] },
					mark: { type: 'rule', strokeDash: [5, 4], color: refColor, strokeWidth: 1.2 },
					encoding: { y: { datum: baselineTps, type: 'quantitative', scale: yScale } },
				},
				{
					data: { values: [{}] },
					mark: {
						type: 'text',
						align: 'left',
						dx: 2,
						dy: -7,
						fontSize: 10,
						font: 'Karla, sans-serif',
						color: refColor,
						text: 'Ed25519-only baseline',
					},
					encoding: {
						x: { datum: 1, type: 'quantitative' },
						y: { datum: baselineTps, type: 'quantitative', scale: yScale },
					},
				},
				{
					// Where the adoption slider currently sits.
					data: { values: [{}] },
					mark: { type: 'rule', color: isDark ? '#f0ab55' : '#E09434', opacity: 0.55, strokeWidth: 1 },
					encoding: { x: { datum: currentPct, type: 'quantitative' } },
				},
				{
					data: { values },
					mark: { type: 'line', strokeWidth: 2.5, interpolate: 'linear' },
					encoding: {
						x: {
							field: 'adoptionPct',
							type: 'quantitative',
							scale: { domain: [0, 100] },
							axis: { title: 'PQ adoption (%)', grid: true },
						},
						y: {
							field: 'effectiveTps',
							type: 'quantitative',
							scale: yScale,
							axis: { title: 'effective TPS (log)', grid: true, format: 's' },
						},
						color: {
							field: 'bound',
							type: 'nominal',
							scale: { domain: boundDomain, range: boundColors },
							legend: { title: 'binding bound', ...legendConfig },
						},
						tooltip: { field: 'tooltip', type: 'nominal' },
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
		points;
		baselineTps;
		currentPct;
		$themeStore;
		render();
	});
</script>

<div bind:this={container} class="w-full"></div>
