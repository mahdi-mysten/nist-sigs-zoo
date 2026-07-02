#!/usr/bin/env node
// Import a pq-bench results CSV (sui-pq repo, sui/benchmark) into data/mysten/<host>.csv.
//
// Usage: npm run import-bench -- <results.csv> <mac-m2-max|server>
//
// Server flow: run sui-pq's sui/benchmark/run-on-server.sh on the server, scp the
// resulting results-<label>.csv here, then import it with host "server".

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mirrors MYSTEN_BENCH_HEADER in src/lib/mystenBench.ts and the header the sui-pq
// harness emits — all three must agree byte-for-byte or the site parser rejects the file.
const EXPECTED_HEADER =
	'name,family,security_level,std,pk_len,sig_len,sk_len,keygen_ns,sign_ns,verify_ns,verify_cyc,verify_iters,vs_ed25519';

const HOSTS = ['mac-m2-max', 'server'];

const USAGE = `usage: npm run import-bench -- <results.csv> <host>
  <results.csv>  CSV emitted by the sui-pq benchmark harness
  <host>         one of: ${HOSTS.join(', ')}`;

function fail(msg) {
	console.error(`error: ${msg}\n\n${USAGE}`);
	process.exit(1);
}

const [csvPath, host] = process.argv.slice(2);
if (!csvPath || !host) fail('expected two arguments: <results.csv> <host>');
if (!HOSTS.includes(host)) fail(`unknown host "${host}" — expected one of: ${HOSTS.join(', ')}`);

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
const dest = join(repoRoot, 'data', 'mysten', `${host}.csv`);
writeFileSync(dest, text);
console.log(`wrote ${dest} (${dataRows} data rows)`);
