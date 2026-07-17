// Build-time loader for the Mysten measured benchmarks in data/mysten/*.csv.
// Do not import from unit tests — needs the Vite runtime (see CLAUDE.md).
import { parseMystenBenchCsv, type MystenBenchRow } from './mystenBench';

// Machine that produced the numbers, shown in the lens's data-source footnote —
// keep this honest about what actually ran the benchmark.
export const BENCH_MACHINE = 'Apple M2 Max (macOS, arm64)';

const files = import.meta.glob('../../data/mysten/*.csv', {
	eager: true,
	query: '?raw',
	import: 'default',
}) as Record<string, string>;

function rowsFor(name: string): MystenBenchRow[] {
	const entry = Object.entries(files).find(([path]) => path.endsWith(`/${name}.csv`));
	return entry ? parseMystenBenchCsv(entry[1]) : [];
}

export const mystenBench: MystenBenchRow[] = rowsFor('mac-m2-max');
