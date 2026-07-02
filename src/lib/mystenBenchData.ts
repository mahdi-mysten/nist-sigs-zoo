// Build-time loader for the Mysten measured benchmarks in data/mysten/*.csv.
// Do not import from unit tests — needs the Vite runtime (see CLAUDE.md).
import { parseMystenBenchCsv, type MystenBenchRow } from './mystenBench';

export type MystenHost = 'mac-m2-max' | 'server';

// Toggle metadata for the Sui lens. `machine` is the label shown in the data-source
// note; keep it honest about what actually ran the benchmark.
export const MYSTEN_HOSTS: { id: MystenHost; label: string; machine: string }[] = [
	{ id: 'mac-m2-max', label: 'Mac M2 Max', machine: 'Apple M2 Max (macOS, arm64)' },
	{ id: 'server', label: 'Sui-validator server', machine: 'Sui-validator-class server' },
];

const files = import.meta.glob('../../data/mysten/*.csv', {
	eager: true,
	query: '?raw',
	import: 'default',
}) as Record<string, string>;

function rowsFor(host: MystenHost): MystenBenchRow[] {
	const entry = Object.entries(files).find(([path]) => path.endsWith(`/${host}.csv`));
	// Missing file behaves like a header-only placeholder: pending, not an error.
	return entry ? parseMystenBenchCsv(entry[1]) : [];
}

export const mystenBench: Record<MystenHost, MystenBenchRow[]> = {
	'mac-m2-max': rowsFor('mac-m2-max'),
	server: rowsFor('server'),
};
