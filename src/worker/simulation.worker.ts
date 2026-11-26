import { spin } from '../engine';
import type { FromWorker, ToWorker } from './protocol';
import { serveSimulations } from './serve';

/**
 * The browser Web Worker entry. Start it as a module worker, for example with
 * `createBrowserWorker()` from `./browser`.
 *
 * `tsconfig.json` has no DOM or WebWorker library (rule 5 keeps globals out of src/), so
 * the few globals used here are typed by hand.
 */
interface WorkerScope {
  postMessage(message: FromWorker): void;
  addEventListener(type: 'message', listener: (event: { data: ToWorker }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: ToWorker }) => void): void;
  setTimeout(callback: () => void, ms: number): unknown;
}

const scope = globalThis as unknown as WorkerScope;

serveSimulations(
  {
    postMessage: (message) => scope.postMessage(message),
    onMessage: (listener) => {
      const handler = (event: { data: ToWorker }): void => listener(event.data);
      scope.addEventListener('message', handler);
      return () => scope.removeEventListener('message', handler);
    },
  },
  spin,
  { yieldToEvents: () => new Promise((resolve) => scope.setTimeout(resolve, 0)) },
);
