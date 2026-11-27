import { useCallback, useEffect, useRef, useState } from 'react';
import { summarise, type GameConfig, type SimulationJob, type SimulationSummary } from '../../engine';
import { simulationJob, workerCount } from './simulation-job';
import { createBrowserWorker } from '../../worker/browser';
import { runInWorkers, type ParallelRun } from '../../worker/pool';
import type { WorkerHandle } from '../../worker/protocol';

/**
 * "Simulate N spins" for the panel: one job split across Web Workers by `runInWorkers`,
 * with progress and cancel. The merged result equals a single-thread run of the same job
 * (src/worker/README.md), so the worker count never changes the figures.
 */

export type SimulationState =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly job: SimulationJob; readonly completed: number; readonly cancelling: boolean }
  | {
      readonly status: 'finished';
      readonly job: SimulationJob;
      readonly cancelled: boolean;
      /** Null when a cancel came before any spin was played. */
      readonly summary: SimulationSummary | null;
      readonly workers: number;
      readonly milliseconds: number;
    }
  | { readonly status: 'error'; readonly message: string };

/** The simulation's own random seed: which seed is used decides nothing about the odds. */
export function randomSimulationSeed(): string {
  const words = new Uint32Array(2);
  globalThis.crypto.getRandomValues(words);
  return Array.from(words, (w) => w.toString(16).padStart(8, '0')).join('');
}

export function useSimulation(config: GameConfig): {
  readonly state: SimulationState;
  readonly start: (count: number) => void;
  readonly cancel: () => void;
} {
  const [state, setState] = useState<SimulationState>({ status: 'idle' });
  const runRef = useRef<{ run: ParallelRun; workers: WorkerHandle[] } | null>(null);

  const stopWorkers = useCallback(() => {
    const current = runRef.current;
    runRef.current = null;
    if (current !== null) for (const w of current.workers) w.terminate();
  }, []);

  // Leaving the page or unmounting the panel stops any run.
  useEffect(() => stopWorkers, [stopWorkers]);

  const start = useCallback(
    (count: number) => {
      if (runRef.current !== null) return;
      const job = simulationJob(config, count, randomSimulationSeed());
      const workers = Array.from({ length: workerCount(count, navigator.hardwareConcurrency || 2) }, createBrowserWorker);
      const started = performance.now();
      let last = 0;
      setState({ status: 'running', job, completed: 0, cancelling: false });
      let run: ParallelRun;
      try {
        run = runInWorkers(workers, config, job, {
          onProgress: (completed) => {
            // Several workers report per batch; a few updates a second are plenty.
            const now = performance.now();
            if (now - last < 100 && completed < job.count) return;
            last = now;
            setState((s) => (s.status === 'running' && s.job === job ? { ...s, completed } : s));
          },
        });
      } catch (error) {
        for (const w of workers) w.terminate();
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        return;
      }
      runRef.current = { run, workers };
      run.result.then(
        (outcome) => {
          if (runRef.current?.run !== run) return;
          stopWorkers();
          setState({
            status: 'finished',
            job,
            cancelled: outcome.cancelled,
            summary: outcome.stats.spins === 0 ? null : summarise(outcome.stats),
            workers: workers.length,
            milliseconds: performance.now() - started,
          });
        },
        (error: unknown) => {
          if (runRef.current?.run !== run) return;
          stopWorkers();
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        },
      );
    },
    [config, stopWorkers],
  );

  const cancel = useCallback(() => {
    const current = runRef.current;
    if (current === null) return;
    current.run.cancel();
    setState((s) => (s.status === 'running' ? { ...s, cancelling: true } : s));
  }, []);

  return { state, start, cancel };
}
