import type { FromWorker, ToWorker, WorkerHandle } from './protocol';

/**
 * A browser Web Worker running `simulation.worker.ts`, as a {@link WorkerHandle} for
 * `runInWorkers`. The `new URL(..., import.meta.url)` form is the one Vite bundles.
 *
 * Typed by hand for the same reason as the worker entry: no DOM library in `tsconfig.json`.
 * Not exercised by the unit tests, which run under Node; `tests/e2e/stats.spec.ts` runs it.
 */
interface BrowserWorker {
  postMessage(message: ToWorker): void;
  addEventListener(type: 'message', listener: (event: { data: FromWorker }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: FromWorker }) => void): void;
  terminate(): void;
}

interface WorkerUrl {
  readonly href: string;
}
declare const URL: new (url: string, base: string) => WorkerUrl;
declare global {
  // Present in browsers and Node alike; Vite's client typings will declare it too.
  interface ImportMeta {
    // Not readonly, to match Vite's own declaration when the app's program includes this file.
    url: string;
  }
}

// The browser's Worker, typed by hand. Vite recognises only the literal
// `new Worker(new URL(...), ...)` form and bundles the worker from it; an aliased constructor
// would ship the .ts file as a plain asset instead.
declare const Worker: new (url: WorkerUrl, options: { type: 'module' }) => BrowserWorker;

export function createBrowserWorker(): WorkerHandle {
  const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
  return {
    postMessage: (message) => worker.postMessage(message),
    onMessage: (listener) => {
      const handler = (event: { data: FromWorker }): void => listener(event.data);
      worker.addEventListener('message', handler);
      return () => worker.removeEventListener('message', handler);
    },
    terminate: () => worker.terminate(),
  };
}
