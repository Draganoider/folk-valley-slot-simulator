import { Worker } from 'node:worker_threads';
import { WORKER_FAILED } from '../protocol';
import type { FromWorker, ToWorker, WorkerHandle } from '../protocol';

export interface NodeWorkerOptions {
  /** Path of a module exporting `spin` to use instead of the engine's (tests, `--spin-module`). */
  readonly spinModule?: string;
}

/**
 * A Node worker thread running `thread.ts`, as a {@link WorkerHandle}: the Node twin of
 * `createBrowserWorker`, so `runInWorkers` drives both the same way.
 *
 * The thread loads TypeScript through tsx (`--import tsx`, resolved from the working
 * directory, which is the repository root under `npm run` and Vitest).
 */
export function createNodeWorker(options: NodeWorkerOptions = {}): WorkerHandle {
  const worker = new Worker(new URL('./thread.ts', import.meta.url), {
    execArgv: ['--import', 'tsx'],
    workerData: options.spinModule === undefined ? {} : { spinModule: options.spinModule },
  });
  return {
    postMessage: (message: ToWorker) => worker.postMessage(message),
    onMessage: (listener: (message: FromWorker) => void) => {
      // A thread that fails outside a run (a module that will not load, say) reports to
      // every run on it, under the id WORKER_FAILED.
      const onError = (error: Error): void => listener({ type: 'error', id: WORKER_FAILED, message: error.message });
      worker.on('message', listener);
      worker.on('error', onError);
      return () => {
        worker.off('message', listener);
        worker.off('error', onError);
      };
    },
    terminate: () => void worker.terminate(),
  };
}
