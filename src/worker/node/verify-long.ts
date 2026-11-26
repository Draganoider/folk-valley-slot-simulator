import { availableParallelism } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  FOLK_VALLEY_CONFIG,
  RNG_VERSION,
  TEXT_SEED_VERSION,
  WILD_REELS,
  analyse,
  assertValidConfig,
  bernoulliSigma,
  bruteForceBase,
  checkSeedSweep,
  checkTolerance,
  drawStops,
  formatSeed,
  gridFromStops,
  landingWildSets,
  reelSweep,
  resolveSession,
  seedFromText,
  sortedCells,
  spinStreams,
  summarise,
  waysCoins,
  waysTable,
  profileWindow,
} from '../../engine';
import type { GameConfig, SimulationJob, Theoretical, ToleranceCheck, TheoreticalReport } from '../../engine';
import { runInWorkers } from '../pool';
import { createNodeWorker } from './pool';

/**
 * `npm run verify:long`: the nightly analysis and long verification (DR-010), against the
 * analyser's theoretical values. Too slow for every push; `npm test` runs the short forms.
 *
 * 1. The analyser's report (`analysis.json`).
 * 2. The base game by brute force over every combination of distinct windows, with no wild
 *    reels and with each set a landing can turn wild, compared cell by cell with the
 *    analyser's reel sweep.
 * 3. Seeded component simulations: the base game alone and the Session alone.
 * 4. The whole game as a seed sweep: K seeds from a recorded base, each N paid spins on
 *    worker threads, each within 4·σ/√N, pooled, and the z-scores judged as a set.
 *
 * Writes `analysis.json` and `verification.json` to `--out` and exits 1 if any check fails.
 * Seeds are fixed so the job is reproducible; a failing seed is a finding, never a reason to
 * change it (math-targets 6.3).
 */

export const USAGE = `Usage: npm run verify:long -- [options]

  --out DIR          where the JSON reports go                 (default .scratch/verify-long)
  --config FILE      configuration JSON                         (default the shipped one)
  --seeds K          seeds in the whole-game sweep              (default 20)
  --spins N          paid spins per seed                        (default 5000000)
  --base N           base-game grids                            (default 10000000)
  --sessions N       forced Sessions                            (default 1000000)
  --workers N        worker threads                             (default CPUs - 1)
  --no-brute         skip the brute-force base enumeration`;

const SEED_BASE = 'long-run-2026-11-25';

function int(value: string | undefined, fallback: number, flag: string): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${flag} needs a positive integer; got "${value}".`);
  return n;
}

const theo = (value: number): Theoretical<number> => ({ kind: 'theoretical', value });

interface Check extends ToleranceCheck {
  readonly name: string;
  readonly n: number;
}

function check(name: string, observed: number, theoretical: Theoretical<number>, sigma: Theoretical<number>, n: number): Check {
  return { name, n, ...checkTolerance({ observed, theoretical, sigma, n }) };
}

function log(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** Brute force against the sweep, for the plain grid and every wild set the tiers can use. */
function bruteChecks(config: GameConfig): { wildReels: number[]; cells: number; equal: boolean; seconds: number }[] {
  const sets: number[][] = [[]];
  for (const set of landingWildSets()) {
    if (config.trickTiers.some((t) => t.landing.extraWildReels + 1 === set.length)) sets.push(set);
  }
  return sets.map((wildReels) => {
    const t = Date.now();
    const brute = bruteForceBase(config, config.reels, wildReels);
    const sweep = reelSweep(config, config.reels, wildReels);
    const equal = JSON.stringify(sortedCells(brute)) === JSON.stringify(sortedCells(sweep));
    const seconds = (Date.now() - t) / 1000;
    log(`brute force, wild reels [${wildReels.map((r) => r + 1).join(', ')}]: ${equal ? 'equal' : 'DIFFERENT'} (${seconds.toFixed(0)} s)`);
    return { wildReels: wildReels.map((r) => r + 1), cells: brute.cells.length, equal, seconds };
  });
}

function baseOnly(config: GameConfig, report: TheoreticalReport, n: number): Check[] {
  const master = seedFromText(`${SEED_BASE}-base`);
  const table = waysTable(config);
  const profiles = config.reels.map(() => new Uint8Array(table.paying.length));
  let total = 0;
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const grid = gridFromStops(config.reels, drawStops(spinStreams(master, i).outcome, config.reels), config.grid.rows);
    grid.forEach((window, reel) => profileWindow(table, window, reel === 0, profiles[reel]));
    const coins = waysCoins(table, profiles);
    total += coins;
    if (coins > 0) hits++;
  }
  const b = report.baseGame.value;
  return [
    check('base game RTP', total / n / config.bet.coinsPerSpin, theo(b.rtp), theo(b.sigma), n),
    check('base game hit frequency', hits / n, theo(b.hitFrequency), bernoulliSigma(theo(b.hitFrequency)), n),
  ];
}

function sessionOnly(config: GameConfig, report: TheoreticalReport, n: number): Check[] {
  const master = seedFromText(`${SEED_BASE}-session`);
  const s = report.sessions.value[0];
  if (s === undefined) throw new Error('The report has no Session figures.');
  let total = 0;
  let pain = 0;
  for (let i = 0; i < n; i++) {
    const r = resolveSession(config, { kind: 'flyers', count: 3 }, spinStreams(master, i), Number.MAX_SAFE_INTEGER);
    total += r.totalWinCoins;
    if (r.endReason === 'pain-limit') pain++;
  }
  return [
    check('Session mean win (3 Flyers)', total / n / config.bet.coinsPerSpin, theo(s.meanWin), theo(s.sdWin), n),
    check('Session pain-limit endings', pain / n, theo(s.painLimitProbability), bernoulliSigma(theo(s.painLimitProbability)), n),
  ];
}

async function wholeGame(
  config: GameConfig,
  report: TheoreticalReport,
  seeds: number,
  spins: number,
  workerCount: number,
): Promise<{ perSeed: unknown[]; pooled: Check[]; sweep: ReturnType<typeof checkSeedSweep> }> {
  const workers = Array.from({ length: workerCount }, () => createNodeWorker());
  const perSeed: { seedText: string; masterSeed: string; checks: Check[]; summary: unknown }[] = [];
  const z: number[] = [];
  let bet = 0;
  let win = 0;
  const counts = { hits: 0, above: 0, ldw: 0, tricks: 0, sessions: 0, n: 0 };
  try {
    for (let k = 0; k < seeds; k++) {
      const seedText = `${SEED_BASE}-${String(k).padStart(2, '0')}`;
      const job: SimulationJob = {
        masterSeed: formatSeed(seedFromText(seedText)),
        startIndex: 0,
        count: spins,
        betLevel: config.bet.levels[0] as number,
        laneLength: 1_000_000,
        initialState: null,
      };
      const t = Date.now();
      const outcome = await runInWorkers(workers, config, job, { batchSize: 20_000 }).result;
      const summary = summarise(outcome.stats);
      const n = summary.spins;
      const rtp = check('RTP', summary.rtp.value, report.rtp, report.sigmaLongRun, n);
      z.push(rtp.zScore);
      bet += summary.totalBetCoins;
      win += summary.totalWinCoins;
      const c = summary.counts;
      counts.hits += c.hits;
      counts.above += c.winsAboveBet;
      counts.ldw += c.lossesDisguisedAsWins;
      counts.tricks += c.tricks.attempts;
      const tr = c.sessions.triggers;
      counts.sessions += tr.flyers3 + tr.flyers4 + tr.flyers5 + tr.scarCard;
      counts.n += n;
      perSeed.push({ seedText, masterSeed: job.masterSeed, checks: [rtp], summary: { ...summary, counts: undefined } });
      log(`seed ${seedText}: RTP ${(100 * summary.rtp.value).toFixed(3)}%, z ${rtp.zScore.toFixed(2)} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
    }
  } finally {
    for (const w of workers) w.terminate();
  }
  const N = counts.n;
  const rate = (name: string, x: number, p: Theoretical<number>): Check => check(name, x / N, p, bernoulliSigma(p), N);
  const pooled = [
    check('pooled RTP', win / bet, report.rtp, report.sigmaLongRun, N),
    rate('pooled hit frequency', counts.hits, report.hitFrequency),
    rate('pooled win-above-bet frequency', counts.above, report.winAboveBetFrequency),
    rate('pooled LDW frequency', counts.ldw, report.ldwFrequency),
    rate('pooled trick rate', counts.tricks, report.trickRate),
    rate('pooled Session rate', counts.sessions, report.sessionRate),
  ];
  return { perSeed, pooled, sweep: checkSeedSweep(z) };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      out: { type: 'string' },
      config: { type: 'string' },
      seeds: { type: 'string' },
      spins: { type: 'string' },
      base: { type: 'string' },
      sessions: { type: 'string' },
      workers: { type: 'string' },
      'no-brute': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help === true) {
    log(USAGE);
    return;
  }
  const out = resolve(values.out ?? '.scratch/verify-long');
  mkdirSync(out, { recursive: true });
  const config =
    values.config === undefined ? FOLK_VALLEY_CONFIG : assertValidConfig(JSON.parse(readFileSync(values.config, 'utf8')) as unknown);
  const seeds = int(values.seeds, 20, '--seeds');
  const spins = int(values.spins, 5_000_000, '--spins');
  const baseN = int(values.base, 10_000_000, '--base');
  const sessionsN = int(values.sessions, 1_000_000, '--sessions');
  const workers = int(values.workers, Math.max(1, availableParallelism() - 1), '--workers');
  const started = Date.now();

  const report = analyse(config, Date.now);
  writeFileSync(join(out, 'analysis.json'), `${JSON.stringify(report, null, 2)}\n`);
  log(`analysis: RTP ${(100 * report.rtp.value).toFixed(4)}%, σ ${report.sigma.value.toFixed(3)} (${report.work.milliseconds} ms)`);

  const brute = values['no-brute'] === true ? [] : bruteChecks(config);
  const base = baseOnly(config, report, baseN);
  const session = sessionOnly(config, report, sessionsN);
  const game = await wholeGame(config, report, seeds, spins, workers);

  const checks = [...base, ...session, ...game.pooled];
  const pass = brute.every((b) => b.equal) && checks.every((c) => c.pass) && game.sweep.pass;
  const verification = {
    tool: 'folk-valley-verify-long',
    note:
      'Simulated figures are observed; each is checked against the analyser’s theoretical value within 4·σ/√N, with the ' +
      'analyser’s σ. Whole-game checks use σ for consecutive spins (sigmaLongRun), since the Scar Card correlates spins.',
    rngVersion: RNG_VERSION,
    textSeedVersion: TEXT_SEED_VERSION,
    configId: config.id,
    analyserVersion: report.analyserVersion,
    seedBase: SEED_BASE,
    wildEligibleReels: WILD_REELS.map((r) => r + 1),
    theoretical: {
      rtp: report.rtp,
      sigma: report.sigma,
      sigmaLongRun: report.sigmaLongRun,
      hitFrequency: report.hitFrequency,
      sessionRate: report.sessionRate,
      trickRate: report.trickRate,
    },
    bruteForce: brute,
    checks,
    seedSweep: game.sweep,
    perSeed: game.perSeed,
    pass,
    seconds: (Date.now() - started) / 1000,
  };
  writeFileSync(join(out, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`);
  for (const c of checks) {
    log(`${c.pass ? 'pass' : 'FAIL'}  ${c.name}: observed ${c.observed.toPrecision(7)}, theoretical ${c.theoretical.toPrecision(7)}, z ${c.zScore.toFixed(2)}, N ${c.n}`);
  }
  log(`${game.sweep.pass ? 'pass' : 'FAIL'}  seed sweep: mean z ${game.sweep.meanZ.toFixed(3)}, variance ${game.sweep.varianceZ.toFixed(3)} over ${seeds} seeds`);
  log(`${pass ? 'All checks pass' : 'SOME CHECKS FAILED'} in ${verification.seconds.toFixed(0)} s. Reports in ${out}.`);
  if (!pass) process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
