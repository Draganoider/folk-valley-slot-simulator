import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import type { SpinFunction } from '../../engine';
import type { FromWorker, ToWorker } from '../protocol';
import { serveSimulations } from '../serve';

/**
 * A Node `worker_threads` entry serving the same protocol as the browser worker, with the
 * same `serveSimulations`. Started by `createNodeWorker` in `./pool.ts`.
 *
 * `workerData.spinModule`, when set, is the path of a module exporting `spin`, used instead
 * of the engine's; the tests and the CLI's `--spin-module` use it to run a stand-in spin.
 */
const port = parentPort;
if (port === null) throw new Error('thread.ts runs only as a worker thread.');

const data = workerData as { spinModule?: string } | null;
const module = (
  data?.spinModule === undefined
    ? await import('../../engine')
    : await import(pathToFileURL(data.spinModule).href)
) as { spin: SpinFunction };

serveSimulations(
  {
    postMessage: (message: FromWorker) => port.postMessage(message),
    onMessage: (listener: (message: ToWorker) => void) => {
      port.on('message', listener);
      return () => port.off('message', listener);
    },
  },
  module.spin,
  { yieldToEvents: () => new Promise((resolve) => setImmediate(resolve)) },
);
