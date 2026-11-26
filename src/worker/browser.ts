import type { FromWorker, ToWorker, WorkerHandle } from './protocol';

/**
 * A browser Web Worker running `simulation.worker.ts`, as a {@link WorkerHandle} for
 * `runInWorkers`. The `new URL(..., import.meta.url)` form is the one Vite bundles.
 *
 * Typed by hand for the same reason as the worker entry: no DOM library in `tsconfig.json`.
 * Not exercised by the unit tests, which run under Node; the browser tests will.
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
    readonly url: string;
  }
}

type WorkerConstructor = new (url: WorkerUrl, options: { type: 'module' }) => BrowserWorker;

export function createBrowserWorker(): WorkerHandle {
  const WorkerClass = (globalThis as unknown as { Worker: WorkerConstructor }).Worker;
  const worker = new WorkerClass(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
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
