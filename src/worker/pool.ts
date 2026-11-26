import { mergeOutcomes, splitJob } from '../engine';
import type { GameConfig, SimulationJob, SimulationOutcome } from '../engine';
import { WORKER_FAILED } from './protocol';
import type { FromWorker, WorkerHandle } from './protocol';

export interface ParallelOptions {
  /** Spins done across every worker, and the job's total. */
  readonly onProgress?: (completed: number, count: number) => void;
  readonly batchSize?: number;
}

export interface ParallelRun {
  /** The merged outcome: equal to a single-thread `runSimulation` of the same job. */
  readonly result: Promise<SimulationOutcome>;
  /** Asks every worker to stop; `result` then resolves with what was played, marked cancelled. */
  cancel(): void;
}

let nextRunId = 0;

/**
 * Runs one job across `workers`, one chunk each, split by `splitJob` at lane boundaries, and
 * merges the chunks in spin order. The workers belong to the caller, who terminates them.
 * A job that cannot be split (one lane) runs on the first worker alone.
 */
export function runInWorkers(
  workers: readonly WorkerHandle[],
  config: GameConfig,
  job: SimulationJob,
  options: ParallelOptions = {},
): ParallelRun {
  if (workers.length === 0) throw new Error('No workers to run on.');
  const chunks = splitJob(job, workers.length);
  const runId = `run-${nextRunId++}`;
  const progress = chunks.map(() => 0);
  const unsubscribes: (() => void)[] = [];
  let settled = false;

  const cancelAll = (): void => {
    chunks.forEach((_, i) => workers[i]?.postMessage({ type: 'cancel', id: `${runId}-${i}` }));
  };

  const result = new Promise<SimulationOutcome>((resolve, reject) => {
    const outcomes: (SimulationOutcome | null)[] = chunks.map(() => null);
    const finish = (error: Error | null): void => {
      if (settled) return;
      settled = true;
      for (const off of unsubscribes) off();
      if (error !== null) reject(error);
      else resolve(mergeOutcomes(job, outcomes as SimulationOutcome[]));
    };

    chunks.forEach((chunk, i) => {
      const worker = workers[i] as WorkerHandle;
      const id = `${runId}-${i}`;
      unsubscribes.push(
        worker.onMessage((message: FromWorker) => {
          if (message.id !== id && message.id !== WORKER_FAILED) return;
          if (message.type === 'progress') {
            progress[i] = message.completed;
            options.onProgress?.(progress.reduce((a, b) => a + b, 0), job.count);
          } else if (message.type === 'done') {
            outcomes[i] = message.outcome;
            if (outcomes.every((o) => o !== null)) finish(null);
          } else {
            cancelAll();
            finish(new Error(`Worker ${i} failed: ${message.message}`));
          }
        }),
      );
      worker.postMessage({
        type: 'run',
        id,
        config,
        job: chunk,
        ...(options.batchSize === undefined ? {} : { batchSize: options.batchSize }),
      });
    });
  });

  return { result, cancel: cancelAll };
}
