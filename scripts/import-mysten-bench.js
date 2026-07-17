#!/usr/bin/env node
// Import a pq-sig-bench results CSV (github.com/mahdi-mysten/pq-sig-bench) into
// data/mysten/mac-m2-max.csv — the Sui lens's Rust/fastcrypto verify numbers.
//
// Usage: npm run import-bench -- <results.csv>
//
// NOTE: importing overwrites the file wholesale — rows carried over from older
// runs (the SLH-DSA block) must be re-appended by hand until the harness
// benches those schemes itself.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirrors MYSTEN_BENCH_HEADER in src/lib/mystenBench.ts and the header the
// pq-sig-bench harness emits — all three must agree byte-for-byte or the site
// parser rejects the file.
const EXPECTED_HEADER =
	'scheme,impl,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519';

const USAGE = `usage: npm run import-bench -- <results.csv>
  <results.csv>  CSV emitted by the pq-sig-bench harness`;

function fail(msg) {
	console.error(`error: ${msg}\n\n${USAGE}`);
	process.exit(1);
}

const [csvPath] = process.argv.slice(2);
if (!csvPath) fail('expected one argument: <results.csv>');

let text;
try {
	text = readFileSync(csvPath, 'utf8');
} catch (e) {
	fail(`cannot read "${csvPath}": ${e.message}`);
}

// Same lenient line handling as the site parser: comments/blank lines are ignored,
// but the header itself must match exactly — a reordered column would silently swap
// sizes and timings.
const lines = text
	.split('\n')
	.map((l) => l.replace(/\r$/, ''))
	.filter((l) => l.trim() !== '' && !l.trimStart().startsWith('#'));

if (lines.length === 0) fail(`"${csvPath}" contains no CSV lines`);
if (lines[0].trim() !== EXPECTED_HEADER) {
	fail(
		`header mismatch in "${csvPath}"\n  got:      ${lines[0].trim()}\n  expected: ${EXPECTED_HEADER}`
	);
}

const dataRows = lines.length - 1;
if (dataRows === 0) fail(`"${csvPath}" has a valid header but no data rows`);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(repoRoot, 'data', 'mysten', 'mac-m2-max.csv');
writeFileSync(dest, text);
console.log(`wrote ${dest} (${dataRows} data rows)`);
