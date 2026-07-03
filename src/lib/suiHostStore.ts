// Selected measured-bench host, shared between the Sui lens (which owns the
// toggle buttons) and the impact-model section below it. One store so both
// sections always read the same run — a Mac verify median must never feed a
// scenario labeled as the server host.
import { writable } from 'svelte/store';
import type { MystenHost } from './mystenBenchData';

export const suiHost = writable<MystenHost>('mac-m2-max');
