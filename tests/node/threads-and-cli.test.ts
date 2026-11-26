import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_CONFIG, formatSeed, runSimulation, seedFromText, summarise } from '../../src/engine';
import type { SimulationJob } from '../../src/engine';
import { runInWorkers } from '../../src/worker/pool';
import { parseCli } from '../../src/worker/node/cli';
import { createNodeWorker } from '../../src/worker/node/pool';
import { spin as fakeSpin } from '../support/fake-spin';
import { SEED } from '../support/results';

// Real threads and a real child process: what the nightly job runs, with the fake spin.
const FAKE = resolve('tests/support/fake-spin.ts');
const config = PLACEHOLDER_CONFIG;

function cli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/worker/node/cli.ts', ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe('Node worker threads', () => {
  it('three threads give exactly the single-thread outcome', { timeout: 60_000 }, async () => {
    const job: SimulationJob = { masterSeed: SEED, startIndex: 0, count: 9000, betLevel: 1, laneLength: 1000, initialState: null };
    const workers = [0, 1, 2].map(() => createNodeWorker({ spinModule: FAKE }));
    try {
      const merged = await runInWorkers(workers, config, job, { batchSize: 1000 }).result;
      expect(merged).toEqual(runSimulation(fakeSpin, config, job));
    } finally {
      for (const w of workers) w.terminate();
    }
  });

  it('a thread whose spin module will not load rejects the run', { timeout: 60_000 }, async () => {
    const worker = createNodeWorker({ spinModule: resolve('tests/support/does-not-exist.ts') });
    const job: SimulationJob = { masterSeed: SEED, startIndex: 0, count: 10, betLevel: 1, laneLength: null, initialState: null };
    try {
      await expect(runInWorkers([worker], config, job).result).rejects.toThrow(/failed/);
    } finally {
      worker.terminate();
    }
  });
});

describe('npm run simulate', () => {
  it('writes the observed summary, the same on any number of workers', { timeout: 120_000 }, () => {
    const args = ['--spins', '3000', '--seed', SEED, '--lane', '500', '--bet', '1', '--spin-module', FAKE];
    const one = cli(...args, '--workers', '1');
    const three = cli(...args, '--workers', '3');
    expect(one.status, one.stderr).toBe(0);
    expect(three.status, three.stderr).toBe(0);
    expect(three.stdout).toBe(one.stdout);

    const report = JSON.parse(one.stdout) as { label: string; completed: number; cancelled: boolean; summary: unknown; rngVersion: string };
    const job: SimulationJob = { masterSeed: SEED, startIndex: 0, count: 3000, betLevel: 1, laneLength: 500, initialState: null };
    expect(report.label).toBe('simulated');
    expect(report.completed).toBe(3000);
    expect(report.cancelled).toBe(false);
    expect(report.summary).toEqual(JSON.parse(JSON.stringify(summarise(runSimulation(fakeSpin, config, job).stats))));
  });

  it('fails cleanly on bad arguments, and runs the real spin', { timeout: 60_000 }, () => {
    expect(cli('--seed', 'xyz', '--spins', '5').status).toBe(2);
    expect(cli().stderr).toMatch(/--spins is required/);
    const real = cli('--spins', '200', '--workers', '1');
    expect(real.status).toBe(0);
    const report = JSON.parse(real.stdout);
    expect(report.label).toBe('simulated');
    expect(report.completed).toBe(200);
  });
});

describe('parseCli', () => {
  it('reads every option, with the defaults documented in the usage', () => {
    const run = parseCli(['--spins', '10', '--seed-text', 'sweep-2026-11-25-00', '--start', '5', '--bet', '5', '--lane', 'none', '--workers', '2']);
    expect(run.job).toEqual({
      masterSeed: formatSeed(seedFromText('sweep-2026-11-25-00')),
      startIndex: 5,
      count: 10,
      betLevel: 5,
      laneLength: null,
      initialState: null,
    });
    expect(run.seedText).toBe('sweep-2026-11-25-00');
    expect(run.workers).toBe(2);
    const defaults = parseCli(['--spins', '1']);
    expect(defaults.job.masterSeed).toBe('0000000000000000');
    expect(defaults.job.laneLength).toBe(1_000_000);
    expect(defaults.job.betLevel).toBe(1);
    expect(() => parseCli(['--spins', '1', '--seed', '00', '--seed-text', 'x'])).toThrow(/not both/);
    expect(() => parseCli(['--spins', '1', '--bet', '3'])).toThrow(/Bet level/);
  });
});
