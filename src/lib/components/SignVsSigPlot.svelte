<script lang="ts">
	// Wallet cost vs on-chain cost: browser signing time (x) against total on-chain
	// footprint, pk+sig (y), for the schemes we have our own measurements of —
	// the same pair of quantities the Sui lens table puts side by side.
	//
	// A deliberately different dataset from the zoo scatter below: Sign (browser)
	// only exists for the 10 DISPLAY_SCHEMES we benched, not for all ~113 YAML
	// parameter sets, so this chart is not driven by the zoo's filters.
	import { onMount } from 'svelte';
	import { DISPLAY_SCHEMES, SUI_PICK } from '$lib/constants';
	import { aggregateByScheme } from '$lib/mystenBench';
	import { mystenBench } from '$lib/mystenBenchData';
	import { tsBench } from '$lib/tsBenchData';
	import { themeStore } from '$lib/themeStore';

	let container = $state<HTMLDivElement | null>(null);
	let viewHandle: { finalize(): void } | null = null;
	let renderSeq = 0;

	// Sizes come from the Rust harness CSV (they're implementation-independent
	// byte lengths), timings from the TypeScript one — joined by scheme name.
	const sizeByScheme = new Map(aggregateByScheme(mystenBench).map((a) => [a.scheme, a]));
	const tsByScheme = new Map(tsBench.map((r) => [r.scheme, r]));

	// Group by algorithm family so the 10 points read as 4 clusters rather than
	// 10 unrelated dots — the tradeoff being compared is really family-level.
	function familyOf(scheme: string): string {
		if (scheme.startsWith('ML-DSA')) return 'ML-DSA';
		if (scheme.startsWith('FN-DSA')) return 'FN-DSA';
		if (scheme.startsWith('SLH-DSA')) return 'SLH-DSA';
		return 'Ed25519';
	}

	// Point labels carry only the variant — the family is already encoded by colour
	// and named in the legend. Full names ("SLH-DSA-SHAKE-128s") are ~2× wider and
	// collide with each other at this point density.
	function shortLabel(scheme: string): string {
		if (scheme.startsWith('ML-DSA-')) return `ML-${scheme.slice('ML-DSA-'.length)}`;
		if (scheme.startsWith('FN-DSA-')) return `FN-${scheme.slice('FN-DSA-'.length)}`;
		if (scheme.startsWith('SLH-DSA-')) return scheme.slice('SLH-DSA-'.length);
		return scheme;
	}

	const points = DISPLAY_SCHEMES.flatMap((scheme) => {
		const size = sizeByScheme.get(scheme);
		const ts = tsByScheme.get(scheme);
		// Needs both axes to be plottable at all.
		if (!size || ts?.signNs == null) return [];
		const signMs = ts.signNs / 1e6;
		return [
			{
				scheme,
				label: shortLabel(scheme),
				family: familyOf(scheme),
				signMs,
				// y axis: total on-chain footprint, matching the lens's pk+sig column —
				// the public key is stored once and the signature ships with every tx,
				// so both ends of the split cost the chain.
				pkPlusSig: size.pkLen + size.sigLen,
				// Assigned below by the label packer.
				labelDy: 0,
				isPick: scheme === SUI_PICK.parameterset,
				tooltip: {
					Scheme: scheme,
					'Sign (browser)': signMs >= 1 ? `${signMs.toFixed(2)} ms` : `${(signMs * 1000).toFixed(1)} µs`,
					'vs Ed25519': ts.signVsEd25519 != null ? `${ts.signVsEd25519.toFixed(1)}×` : '—',
					'sig (bytes)': size.sigLen.toLocaleString(),
					'pk+sig (bytes)': (size.pkLen + size.sigLen).toLocaleString(),
					Measured: `${ts.lib}, median of ${ts.signIters} iterations`,
				},
			},
		];
	});

	// Vega-Lite has no label-collision avoidance, so pack the labels ourselves.
	// The y scale is log over a known domain and PLOT_H is fixed, so each label's
	// vertical position is computable here: walk them top-to-bottom and push any
	// that would land within LABEL_MIN_GAP of the one above.
	//
	// Done in pixel space deliberately. Two earlier data-space heuristics both
	// failed the same way — they pushed *neighbouring* labels toward each other
	// (points either side of a grouping threshold got opposite nudges), which
	// collided ML-87/SHA2-128s and later FN-1024/ML-44. Packing against the
	// previously placed label can't do that by construction, and it subsumes the
	// exact-tie case (SHAKE and SHA2 share a pk+sig, so the second is simply
	// pushed down a line).
	const PLOT_H = 340;
	const LABEL_MIN_GAP = 12;
	{
		// Vega "nices" a log domain out to whole decades, so the scale spans
		// 10^floor(min)..10^ceil(max) — here 10..100k, i.e. 4 decades rather than the
		// data's 2.25. Getting this wrong silently under-computes every gap (an
		// earlier version assumed the raw data extent and packed ~60% too tightly).
		const logs = points.map((p) => Math.log10(p.pkPlusSig));
		const top = Math.ceil(Math.max(...logs));
		const span = top - Math.floor(Math.min(...logs)) || 1;
		const yOf = (v: number) => ((top - Math.log10(v)) / span) * PLOT_H;

		const placed = points
			// Ties broken by x so the order is deterministic run to run.
			.map((p) => ({ p, y: yOf(p.pkPlusSig) }))
			.sort((a, b) => a.y - b.y || a.p.signMs - b.p.signMs);

		let lastY = -Infinity;
		for (const item of placed) {
			const y = Math.max(item.y, lastY + LABEL_MIN_GAP);
			item.p.labelDy = Math.round(y - item.y);
			lastY = y;
		}
	}

	async function render() {
		if (!container) return;
		const seq = ++renderSeq;

		const { default: embed } = await import('vega-embed');
		const isDark = document.documentElement.classList.contains('dark');
		const pickColor = isDark ? '#f0ab55' : '#E09434';
		// Same narrow-viewport handling as ScatterPlot: a right-hand legend eats ~30%
		// of the plot on a phone, which compresses the 4.5-decade x axis enough for
		// the point labels to run into each other.
		const isMobile = window.innerWidth < 640;

		// Labels near the right edge are drawn to the *left* of their point so long
		// names don't clip out of the plot. Threshold derived from the data rather
		// than a hard-coded ms value, so it survives a re-bench.
		const logs = points.map((p) => Math.log10(p.signMs));
		const flipAbove = 10 ** (Math.min(...logs) + 0.55 * (Math.max(...logs) - Math.min(...logs)));
		const mutedColor = isDark ? '#94A3B8' : '#475569';

		// align/dx/dy/fontWeight are Vega-Lite *mark* properties, not encoding
		// channels — passing them as encodings is silently dropped (it warns, and the
		// labels all render identically). So per-point label styling has to become
		// one layer per distinct style, each filtered to the schemes it covers.
		const labelLayers = (() => {
			const groups = new Map<string, { mark: Record<string, unknown>; schemes: string[] }>();
			for (const p of points) {
				const flipped = p.signMs > flipAbove;
				const mark = {
					type: 'text',
					baseline: 'middle',
					fontSize: isMobile ? 9 : 10,
					align: flipped ? 'right' : 'left',
					dx: flipped ? -10 : 10,
					dy: p.labelDy,
					fontWeight: p.isPick ? 'bold' : 'normal',
					color: p.isPick ? pickColor : mutedColor,
				};
				const key = JSON.stringify(mark);
				if (!groups.has(key)) groups.set(key, { mark, schemes: [] });
				groups.get(key)!.schemes.push(p.scheme);
			}
			return [...groups.values()].map(({ mark, schemes }) => ({
				transform: [{ filter: { field: 'scheme', oneOf: schemes } }],
				mark,
				encoding: { text: { field: 'label', type: 'nominal' } },
			}));
		})();

		const familyDomain = ['Ed25519', 'FN-DSA', 'ML-DSA', 'SLH-DSA'];
		const familyRange = isDark
			? ['#9CA3AF', '#60A5FA', '#34D399', '#F87171']
			: ['#6B7280', '#1D4ED8', '#059669', '#DC2626'];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const spec: any = {
			$schema: 'https://vega.github.io/schema/vega-lite/v6.json',
			width: 'container',
			height: PLOT_H,
			autosize: { type: 'fit-x', resize: true },
			data: { values: points },
			layer: [
				{
					mark: { type: 'point', filled: true, size: 130 },
					encoding: {
						color: {
							field: 'family',
							type: 'nominal',
							scale: { domain: familyDomain, range: familyRange },
							legend: {
								title: 'Family',
								labelColor: isDark ? '#94A3B8' : '#475569',
								titleColor: isDark ? '#C5CADA' : '#061128',
								strokeColor: 'transparent',
								padding: 8,
								...(isMobile
									? { orient: 'bottom', direction: 'horizontal', columns: 4, labelFontSize: 10 }
									: {}),
							},
						},
					},
				},
				// Scheme labels — only 10 points, so direct labelling beats a lookup.
				...labelLayers,
				// Sui's pick — same apricot halo the zoo scatter and the lens row use.
				{
					transform: [{ filter: 'datum.isPick' }],
					mark: { type: 'point', filled: false, shape: 'circle', size: 420, strokeWidth: 2.5 },
					encoding: { color: { value: pickColor } },
				},
			],
			encoding: {
				x: {
					field: 'signMs',
					type: 'quantitative',
					scale: { type: 'log' },
					axis: { title: 'Sign — browser (ms)', grid: true },
				},
				y: {
					field: 'pkPlusSig',
					type: 'quantitative',
					scale: { type: 'log' },
					axis: { title: 'pk + sig (bytes)', grid: true, format: 's' },
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
		$themeStore;
		render();
	});
</script>

<div bind:this={container} class="w-full"></div>
<p class="mt-1 text-xs text-pqs-steel/70 dark:text-pqs-bluegray/70">
	Bottom-left is best: cheap to sign in a wallet, small on chain. Our own measurements for the
	{points.length} benched candidates.
</p>
