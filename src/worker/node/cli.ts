import { availableParallelism } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  PLACEHOLDER_CONFIG,
  RNG_VERSION,
  STATS_FORMAT_VERSION,
  TEXT_SEED_VERSION,
  assertValidConfig,
  checkJob,
  formatSeed,
  parseSeed,
  seedFromText,
  splitJob,
  summarise,
} from '../../engine';
import type { GameConfig, SimulationJob } from '../../engine';
import { runInWorkers } from '../pool';
import { createNodeWorker } from './pool';

/**
 * `npm run simulate -- --spins N [options]`: a simulation run without a browser, for the
 * nightly job (DR-010). Same runner, same worker protocol and same merge as the page; the
 * output is JSON with every observed figure and the raw counts. See src/worker/README.md.
 */

export const USAGE = `Usage: npm run simulate -- --spins N [options]

  --spins N          paid spins to play (required)
  --seed HEX         master seed, 16 hex digits            (default 0000000000000000)
  --seed-text TEXT   master seed made from text, e.g. sweep-2026-11-25-00
  --start N          first spin index                      (default 0)
  --bet L            bet level                              (default the lowest)
  --lane N|none      Scar Card resets every N spins         (default 1000000)
  --config FILE      configuration JSON                     (default the placeholder)
  --workers N        worker threads; never changes results  (default CPUs - 1)
  --batch N          spins between progress reports         (default 5000)
  --out FILE         write the JSON here                    (default stdout)
  --spin-module FILE a module exporting spin, used instead of the engine's (testing)

Ctrl+C stops the run and writes what was played, marked cancelled.`;

function positiveInt(value: string, flag: string, min = 0): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`${flag} needs an integer of at least ${min}; got "${value}".`);
  return n;
}

export interface CliRun {
  readonly config: GameConfig;
  readonly job: SimulationJob;
  readonly seedText: string | null;
  readonly workers: number;
  readonly batchSize: number;
  readonly out: string | null;
  readonly spinModule: string | null;
}

export function parseCli(argv: readonly string[]): CliRun {
  const { values } = parseArgs({
    args: [...argv],
    strict: true,
    options: {
      spins: { type: 'string' },
      seed: { type: 'string' },
      'seed-text': { type: 'string' },
      start: { type: 'string' },
      bet: { type: 'string' },
      lane: { type: 'string' },
      config: { type: 'string' },
      workers: { type: 'string' },
      batch: { type: 'string' },
      out: { type: 'string' },
      'spin-module': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help === true) throw new Error(USAGE);
  if (values.spins === undefined) throw new Error(`--spins is required.\n\n${USAGE}`);
  if (values.seed !== undefined && values['seed-text'] !== undefined) {
    throw new Error('Give --seed or --seed-text, not both.');
  }
  const seedText = values['seed-text'] ?? null;
  const masterSeed =
    seedText !== null ? formatSeed(seedFromText(seedText)) : formatSeed(parseSeed(values.seed ?? '0000000000000000'));
  const config =
    values.config === undefined
      ? PLACEHOLDER_CONFIG
      : assertValidConfig(JSON.parse(readFileSync(values.config, 'utf8')) as unknown);
  const lane = values.lane ?? '1000000';
  const job: SimulationJob = {
    masterSeed,
    startIndex: positiveInt(values.start ?? '0', '--start'),
    count: positiveInt(values.spins, '--spins'),
    betLevel: values.bet === undefined ? (config.bet.levels[0] as number) : Number(values.bet),
    laneLength: lane === 'none' ? null : positiveInt(lane, '--lane', 1),
    initialState: null,
  };
  checkJob(config, job);
  return {
    config,
    job,
    seedText,
    workers: positiveInt(values.workers ?? String(Math.max(1, availableParallelism() - 1)), '--workers', 1),
    batchSize: positiveInt(values.batch ?? '5000', '--batch', 1),
    out: values.out ?? null,
    spinModule: values['spin-module'] === undefined ? null : resolve(values['spin-module']),
  };
}

async function main(): Promise<void> {
  let cli: CliRun;
  try {
    cli = parseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 2;
    return;
  }
  const { config, job } = cli;
  const threads = Math.min(cli.workers, splitJob(job, cli.workers).length);
  const workers = Array.from({ length: threads }, () =>
    createNodeWorker(cli.spinModule === null ? {} : { spinModule: cli.spinModule }),
  );
  const started = Date.now();
  let lastReport = 0;
  const run = runInWorkers(workers, config, job, {
    batchSize: cli.batchSize,
    onProgress: (done, count) => {
      const now = Date.now();
      if (now - lastReport < 1000 && done < count) return;
      lastReport = now;
      process.stderr.write(`${done} / ${count} spins (${((100 * done) / Math.max(1, count)).toFixed(1)}%)\n`);
    },
  });
  const onSigint = (): void => {
    process.stderr.write('Cancelling…\n');
    run.cancel();
  };
  process.once('SIGINT', onSigint);
  try {
    const outcome = await run.result;
    const report = {
      tool: 'folk-valley-simulate',
      label: 'simulated',
      note: 'Every figure here is observed in this simulation run. Theoretical values come only from the analyser.',
      rngVersion: RNG_VERSION,
      statsFormatVersion: STATS_FORMAT_VERSION,
      configId: config.id,
      seed: { masterSeed: job.masterSeed, text: cli.seedText, textSeedVersion: cli.seedText === null ? null : TEXT_SEED_VERSION },
      job,
      completed: outcome.completed,
      cancelled: outcome.cancelled,
      summary: outcome.completed === 0 ? null : summarise(outcome.stats),
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (cli.out === null) process.stdout.write(json);
    else writeFileSync(cli.out, json);
    process.stderr.write(
      `${outcome.completed} spins on ${threads} worker(s) in ${((Date.now() - started) / 1000).toFixed(1)} s` +
        `${outcome.cancelled ? ', cancelled' : ''}.\n`,
    );
    if (outcome.cancelled) process.exitCode = 130;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    process.off('SIGINT', onSigint);
    for (const w of workers) w.terminate();
  }
}

// Run only when started as a program, so tests can import parseCli.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
