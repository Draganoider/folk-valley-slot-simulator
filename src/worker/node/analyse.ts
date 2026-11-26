import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { FOLK_VALLEY_CONFIG, analyse, assertValidConfig } from '../../engine';

/**
 * `npm run analyse -- [--config FILE] [--out FILE]`: the analyser's theoretical report for a
 * configuration (the shipped one by default) as JSON, every figure labelled theoretical.
 * About four seconds. `npm run verify:long` runs it too, with the long checks.
 */
function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: { config: { type: 'string' }, out: { type: 'string' } },
  });
  const config =
    values.config === undefined ? FOLK_VALLEY_CONFIG : assertValidConfig(JSON.parse(readFileSync(values.config, 'utf8')) as unknown);
  const json = `${JSON.stringify(analyse(config, Date.now), null, 2)}\n`;
  if (values.out === undefined) process.stdout.write(json);
  else writeFileSync(values.out, json);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
