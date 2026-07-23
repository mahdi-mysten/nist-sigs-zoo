import { CPUSPEED } from './constants';
import type { DataRanges, NistLevel, ParameterSet, ParameterSetYaml, Scheme, SchemeYaml } from './types';

function parseCsv(text: string): Record<string, string>[] {
	const lines = text.trim().split('\n');
	const headers = splitCsvLine(lines[0]);
	return lines.slice(1).map((line) => {
		const values = splitCsvLine(line);
		return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
	});
}

function splitCsvLine(line: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === ',' && !inQuotes) {
			result.push(current.trim());
			current = '';
		} else {
			current += ch;
		}
	}
	result.push(current.trim());
	return result;
}

function parseNum(s: string): number {
	return parseFloat(s.replace(/,/g, '')) || 0;
}

export function parseSchemes(csv: string): Scheme[] {
	return parseCsv(csv).map((d) => ({
		scheme: d['Scheme'],
		status: d['NIST status'],
		// Legacy CSV path has no version label; the FIPS chip falls back to plain "FIPS".
		version: '',
		website: d['Website'],
		category: d['Category'],
		assumption: d['Assumption'],
		broken: d['Broken'] === '' ? false : d['Broken'],
		warning: d['Warning'] === '' ? false : d['Warning'],
		info: d['Info'] === '' ? false : d['Info'],
		classical: d['Broken'] === 'classical',
		tags: [],
	}));
}

export function parseParameterSets(
	csv: string,
	schemes: Scheme[]
): { rows: ParameterSet[]; ranges: DataRanges } {
	const schemeMap = new Map(schemes.map((s) => [s.scheme, s]));

	const rows: ParameterSet[] = parseCsv(csv).map((d) => {
		const rawSignCycles = parseNum(d['signing (cycles)']);
		const rawVerifyCycles = parseNum(d['verification (cycles)']);
		const signingUs = parseNum(d['signing (ms)']) ? parseNum(d['signing (ms)']) * 1000 : null;
		const verificationUs = parseNum(d['verification (ms)']) ? parseNum(d['verification (ms)']) * 1000 : null;

		let signingCycles: number;
		let verificationCycles: number;
		let extrapolated: boolean;

		if (rawSignCycles > 0) {
			extrapolated = false;
			signingCycles = rawSignCycles;
			verificationCycles = rawVerifyCycles;
		} else {
			extrapolated = true;
			signingCycles = signingUs != null ? Math.round((CPUSPEED * signingUs) / 1_000_000) : 0;
			verificationCycles =
				verificationUs != null ? Math.round((CPUSPEED * verificationUs) / 1_000_000) : 0;
		}

		const scheme = schemeMap.get(d['Scheme']);
		if (!scheme) {
			throw new Error(`Unknown scheme: ${d['Scheme']}`);
		}

		const rawLevel = d['Security level'];
		const level: NistLevel = rawLevel === 'Pre-Quantum' ? 'Pre-Quantum' : (Number(rawLevel) as 1 | 2 | 3 | 4 | 5);

		const pk = parseNum(d['pk size']);
		const sig = parseNum(d['sig size']);

		return {
			scheme: d['Scheme'],
			parameterset: d['Parameterset'],
			category: scheme.category,
			status: scheme.status,
			level,
			pk,
			sig,
			pkPlusSig: pk + sig,
			signingCycles,
			verificationCycles,
			signingUs,
			verificationUs,
			extrapolated,
			broken: scheme.broken,
			warning: scheme.warning,
			info: scheme.info,
			classical: scheme.classical,
			website: scheme.website,
			assumption: scheme.assumption,
			notes: null,
			version: '',
			perfSource: null,
		};
	});

	const withSignUs = rows.filter((r) => r.signingUs != null);
	const withVerifyUs = rows.filter((r) => r.verificationUs != null);

	const ranges: DataRanges = {
		pk: [Math.min(...rows.map((r) => r.pk)), Math.max(...rows.map((r) => r.pk))],
		sig: [Math.min(...rows.map((r) => r.sig)), Math.max(...rows.map((r) => r.sig))],
		pkPlusSig: [
			Math.min(...rows.map((r) => r.pkPlusSig)),
			Math.max(...rows.map((r) => r.pkPlusSig)),
		],
		signingCycles: [
			Math.min(...rows.filter((r) => r.signingCycles > 0).map((r) => r.signingCycles)),
			Math.max(...rows.map((r) => r.signingCycles)),
		],
		verificationCycles: [
			Math.min(
				...rows.filter((r) => r.verificationCycles > 0).map((r) => r.verificationCycles)
			),
			Math.max(...rows.map((r) => r.verificationCycles)),
		],
		signingUs: withSignUs.length > 0
			? [Math.min(...withSignUs.map((r) => r.signingUs!)), Math.max(...withSignUs.map((r) => r.signingUs!))]
			: null,
		verificationUs: withVerifyUs.length > 0
			? [Math.min(...withVerifyUs.map((r) => r.verificationUs!)), Math.max(...withVerifyUs.map((r) => r.verificationUs!))]
			: null,
	};

	return { rows, ranges };
}

// The zoo (scatter + table below the Sui lens) is the *exploration* view, so it
// shows every parameter set the YAML carries for a scheme — all of ML-DSA-44/65/87,
// both SLH-DSA speed variants at every level, and so on. (The zoo's SLH-DSA data is
// SHAKE-only; the SHA2 rows come from our own bench CSVs and appear in the Sui lens,
// not here.) The curated "which one would Sui deploy" answer lives in that lens
// hero instead, which pins its own DISPLAY_SCHEMES and is unaffected by these
// constants.
// Flip to true to collapse each scheme back to its floor security level.
export const LOWEST_LEVEL_ONLY = false;

// Level cap, stacked on top of LOWEST_LEVEL_ONLY. 5 = the full NIST category
// range, i.e. no cap in practice. Lower it (e.g. to 2) to re-narrow the zoo to
// the levels a chain would realistically deploy — a scheme whose *floor* is
// above the cap then disappears entirely. Pre-Quantum baselines always pass.
export const MAX_NIST_LEVEL = 5;

export function withinLevelCap(level: NistLevel | number): boolean {
	return level === 'Pre-Quantum' || (typeof level === 'number' && level <= MAX_NIST_LEVEL);
}

// The levels the curated data is *allowed* to contain. Defines the default filter
// state (everything selected) and what a `?l=` URL may select, so widening
// MAX_NIST_LEVEL widens both. Note this is a superset of what's rendered:
// FilterPanel narrows it to levels some row actually has, so a category with no
// data (currently 4) never becomes a checkbox that can't change anything.
export const SELECTABLE_LEVELS: NistLevel[] = (
	['Pre-Quantum', 1, 2, 3, 4, 5] as NistLevel[]
).filter(withinLevelCap);

const LEVEL_ORDER: Record<string, number> = {
	'Pre-Quantum': 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5,
};

// Keep every set at the scheme's lowest level: genuine variants there (SLH-DSA s/f
// and SHA2/SHAKE, UOV pkc/classic, …) are distinct trade-offs, so the cut is by
// level, never by name.
function lowestLevelSets(sets: ParameterSetYaml[]): ParameterSetYaml[] {
	const lowest = Math.min(...sets.map((ps) => LEVEL_ORDER[String(ps.level)] ?? 99));
	return sets.filter((ps) => (LEVEL_ORDER[String(ps.level)] ?? 99) === lowest);
}

export function processYamlSchemes(
	schemeData: SchemeYaml[],
	tagFilter?: string,
	{ useLatestVersion = false }: { useLatestVersion?: boolean } = {}
): {
	schemes: Scheme[];
	parameterSets: ParameterSet[];
	ranges: DataRanges;
} {
	const schemes: Scheme[] = [];
	const rows: ParameterSet[] = [];

	for (const yaml of schemeData) {
		if (!yaml.versions || yaml.versions.length === 0) continue;

		const sorted = [...yaml.versions].sort((a, b) => b.date.localeCompare(a.date));

		let latest;
		if (tagFilter) {
			// Pick latest version with the requested tag
			const tagged = sorted.filter((v) => v.tags?.includes(tagFilter));
			if (tagged.length > 0) {
				// useLatestVersion: include scheme if it has the tag, but show newest version
				latest = useLatestVersion ? sorted[0] : tagged[0];
			} else if (yaml.versions.every((v) => !v.tags || v.tags.length === 0)) {
				// Untagged reference scheme — always include
				latest = sorted[0];
			} else {
				continue; // Scheme exists but not in this round
			}
		} else {
			latest = sorted[0];
		}

		const parametersets = (
			LOWEST_LEVEL_ONLY ? lowestLevelSets(latest.parametersets) : latest.parametersets
		).filter((ps) => withinLevelCap(ps.level));
		// Floor above MAX_NIST_LEVEL: the whole scheme drops out of the zoo.
		if (parametersets.length === 0) continue;

		const scheme: Scheme = {
			scheme: yaml.name,
			status: latest.status,
			version: latest.version,
			website: yaml.website,
			category: yaml.category,
			assumption: yaml.assumption,
			broken: latest.broken ?? false,
			warning: latest.warning ?? false,
			info: latest.info ?? false,
			classical: latest.broken === 'classical',
			tags: [...new Set(yaml.versions.flatMap((v) => v.tags ?? []))],
		};
		schemes.push(scheme);

		for (const ps of parametersets) {
			const level: NistLevel =
				ps.level === 'Pre-Quantum' ? 'Pre-Quantum' : (ps.level as 1 | 2 | 3 | 4 | 5);

			const signingUs = ps.signing_us ?? null;
			const verificationUs = ps.verification_us ?? null;

			let signingCycles: number;
			let verificationCycles: number;
			let extrapolated: boolean;

			if (ps.signing_cycles != null && ps.signing_cycles > 0) {
				extrapolated = false;
				signingCycles = ps.signing_cycles;
				verificationCycles = ps.verification_cycles ?? 0;
			} else {
				extrapolated = true;
				signingCycles = signingUs != null ? Math.round((CPUSPEED * signingUs) / 1_000_000) : 0;
				verificationCycles =
					verificationUs != null ? Math.round((CPUSPEED * verificationUs) / 1_000_000) : 0;
			}

			// Parameterset flags fall back to version-level flags
			const broken = ps.broken ?? latest.broken ?? false;
			const warning = ps.warning ?? latest.warning ?? false;
			const info = ps.info ?? latest.info ?? false;

			const pk = ps.pk;
			const sig = ps.sig;

			rows.push({
				scheme: yaml.name,
				parameterset: ps.name,
				category: yaml.category,
				status: latest.status,
				level,
				pk,
				sig,
				pkPlusSig: pk + sig,
				signingCycles,
				verificationCycles,
				signingUs,
				verificationUs,
				extrapolated,
				broken: broken === false ? false : broken || false,
				warning: warning === false ? false : warning || false,
				info: info === false ? false : info || false,
				classical: broken === 'classical',
				website: yaml.website,
				assumption: yaml.assumption,
				notes: ps.notes ?? null,
				version: latest.version,
				perfSource: latest.perf_source ?? null,
			});
		}
	}

	const nonZeroSign = rows.filter((r) => r.signingCycles > 0);
	const nonZeroVerify = rows.filter((r) => r.verificationCycles > 0);
	const withSignUs = rows.filter((r) => r.signingUs != null);
	const withVerifyUs = rows.filter((r) => r.verificationUs != null);

	const ranges: DataRanges = {
		pk: [Math.min(...rows.map((r) => r.pk)), Math.max(...rows.map((r) => r.pk))],
		sig: [Math.min(...rows.map((r) => r.sig)), Math.max(...rows.map((r) => r.sig))],
		pkPlusSig: [
			Math.min(...rows.map((r) => r.pkPlusSig)),
			Math.max(...rows.map((r) => r.pkPlusSig)),
		],
		signingCycles: [
			Math.min(...nonZeroSign.map((r) => r.signingCycles)),
			Math.max(...nonZeroSign.map((r) => r.signingCycles)),
		],
		verificationCycles: [
			Math.min(...nonZeroVerify.map((r) => r.verificationCycles)),
			Math.max(...nonZeroVerify.map((r) => r.verificationCycles)),
		],
		signingUs: withSignUs.length > 0
			? [Math.min(...withSignUs.map((r) => r.signingUs!)), Math.max(...withSignUs.map((r) => r.signingUs!))]
			: null,
		verificationUs: withVerifyUs.length > 0
			? [Math.min(...withVerifyUs.map((r) => r.verificationUs!)), Math.max(...withVerifyUs.map((r) => r.verificationUs!))]
			: null,
	};

	return { schemes, parameterSets: rows, ranges };
}
