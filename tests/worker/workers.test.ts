import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_CONFIG, runSimulation } from '../../src/engine';
import type { SimulationJob } from '../../src/engine';
import type { ToWorker } from '../../src/worker/protocol';
import { runInWorkers } from '../../src/worker/pool';
import { spin as fakeSpin } from '../support/fake-spin';
import { loopbackWorker } from '../support/loopback';
import { SEED } from '../support/results';

const config = PLACEHOLDER_CONFIG;
const job: SimulationJob = { masterSeed: SEED, startIndex: 250, count: 6000, betLevel: 2, laneLength: 400, initialState: null };

describe('runInWorkers (in-process workers, the real worker code)', () => {
  it('any number of workers gives exactly the single-thread outcome', async () => {
    const single = runSimulation(fakeSpin, config, job);
    for (const n of [1, 2, 3, 4, 7]) {
      const workers = Array.from({ length: n }, () => loopbackWorker(fakeSpin));
      const merged = await runInWorkers(workers, config, job, { batchSize: 700 }).result;
      expect(merged).toEqual(single);
      for (const w of workers) w.terminate();
    }
  });

  it('reports progress that rises to the total', async () => {
    const seen: number[] = [];
    const workers = [loopbackWorker(fakeSpin), loopbackWorker(fakeSpin)];
    await runInWorkers(workers, config, job, { batchSize: 500, onProgress: (done) => seen.push(done) }).result;
    expect(seen.length).toBeGreaterThan(4);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] as number);
    expect(seen.at(-1)).toBe(job.count);
  });

  it('cancel stops every worker and returns what was played, marked cancelled', async () => {
    const workers = [loopbackWorker(fakeSpin), loopbackWorker(fakeSpin)];
    const big: SimulationJob = { ...job, count: 2_000_000, laneLength: 100_000 };
    let run: ReturnType<typeof runInWorkers> | null = null;
    run = runInWorkers(workers, config, big, {
      batchSize: 100,
      onProgress: (done) => {
        if (done >= 400) run?.cancel();
      },
    });
    const out = await run.result;
    expect(out.cancelled).toBe(true);
    expect(out.completed).toBeGreaterThanOrEqual(400);
    expect(out.completed).toBeLessThan(10_000);
    expect(out.stats.spins).toBe(out.completed);
  });

  it('a cancelled single worker holds exactly the prefix it played', async () => {
    const worker = loopbackWorker(fakeSpin);
    let run: ReturnType<typeof runInWorkers> | null = null;
    run = runInWorkers([worker], config, { ...job, count: 100_000 }, {
      batchSize: 50,
      onProgress: (done) => {
        if (done >= 200) run?.cancel();
      },
    });
    const out = await run.result;
    expect(out.cancelled).toBe(true);
    expect(out.stats).toEqual(runSimulation(fakeSpin, config, { ...job, count: out.completed }).stats);
  });

  it('sends each chunk as plain data and rejects on a worker error', async () => {
    const log: ToWorker[] = [];
    const workers = [loopbackWorker(fakeSpin, log), loopbackWorker(fakeSpin, log)];
    await runInWorkers(workers, config, job).result;
    const runs = log.filter((m) => m.type === 'run');
    expect(runs).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(runs))).toEqual(runs);

    const bad = { ...config, scarCard: { ...config.scarCard, size: 0 } };
    await expect(runInWorkers([loopbackWorker(fakeSpin)], bad, job).result).rejects.toThrow(/Worker 0 failed/);
  });

  it('runs the real spin across workers exactly as a single thread does', async () => {
    const { spin } = await import('../../src/engine');
    const realJob = { ...job, count: 800 };
    const single = runSimulation(spin, config, realJob);
    const workers = Array.from({ length: 3 }, () => loopbackWorker(spin));
    const merged = await runInWorkers(workers, config, realJob, { batchSize: 150 }).result;
    expect(merged.stats).toEqual(single.stats);
    expect(merged.completed).toBe(800);
  });
});
