// Runs every scripts/check-*.mjs sequentially and prints a pass/fail table.
// Invoked by `npm run test:browser:all`; not part of `npm test`.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const scripts = readdirSync(import.meta.dirname)
  .filter(name => name.startsWith('check-') && name.endsWith('.mjs'))
  .sort();

const results = [];
for (const name of scripts) {
  const started = Date.now();
  // Each check starts its own Vite server; run them one at a time. check-design
  // takes an optional screenshot tag, the rest ignore extra arguments.
  const run = spawnSync(process.execPath, [join(import.meta.dirname, name), 'suite'], { stdio: 'inherit' });
  results.push({ name: name.replace(/\.mjs$/, ''), pass: run.status === 0, seconds: Math.round((Date.now() - started) / 1000) });
}

const width = Math.max(...results.map(result => result.name.length));
console.log('\nBrowser check results:');
for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name.padEnd(width)}  ${result.seconds}s`);
const failed = results.filter(result => !result.pass).map(result => result.name);
console.log(failed.length ? `Failed: ${failed.join(', ')}` : 'All browser checks passed.');
process.exit(failed.length ? 1 : 0);
