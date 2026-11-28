import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FOLK_VALLEY_CONFIG, analyse, type TheoreticalReport } from '../../engine';

/**
 * `npm run analyse:panel`: writes `src/ui/stats/theoretical-report.ts`, the analyser's report
 * for the shipped configuration, which the statistics panel shows. `analyse` takes about four
 * seconds on a fast machine and far longer on a slow phone, so the panel does not run it.
 *
 * The clock is left at its default (0), so the file depends on the configuration and the
 * analyser alone and the same inputs always write the same bytes. `tests/ui/stats.test.ts`
 * fails when the committed file no longer equals `analyse(FOLK_VALLEY_CONFIG)`; run this to
 * refresh it after any change to the configuration or the analyser.
 */
export const PANEL_REPORT_PATH = 'src/ui/stats/theoretical-report.ts';

export function panelReportSource(report: TheoreticalReport): string {
  return [
    '// Written by `npm run analyse:panel` (src/worker/node/panel-report.ts). Do not edit by hand:',
    '// tests/ui/stats.test.ts fails when this no longer equals analyse(FOLK_VALLEY_CONFIG).',
    "import type { TheoreticalReport } from '../../engine';",
    '',
    `export const THEORETICAL_REPORT: TheoreticalReport = ${JSON.stringify(report, null, 2)};`,
    '',
  ].join('\n');
}

function main(): void {
  const out = resolve(PANEL_REPORT_PATH);
  writeFileSync(out, panelReportSource(analyse(FOLK_VALLEY_CONFIG)));
  process.stderr.write(`Wrote ${out}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
