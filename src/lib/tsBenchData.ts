// Build-time loader for data/mysten/ts-bench.csv. Do not import from unit
// tests — needs the Vite runtime (see CLAUDE.md).
import { parseTsBenchCsv, type TsBenchRow } from './tsBench';

const files = import.meta.glob('../../data/mysten/ts-bench.csv', {
	eager: true,
	query: '?raw',
	import: 'default',
}) as Record<string, string>;

const text = Object.values(files)[0];
// Missing file behaves like a header-only placeholder: no rows, not an error.
export const tsBench: TsBenchRow[] = text ? parseTsBenchCsv(text) : [];
