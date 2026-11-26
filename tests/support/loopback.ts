import type { SpinFunction } from '../../src/engine';
import type { Endpoint, FromWorker, ToWorker, WorkerHandle } from '../../src/worker/protocol';
import { serveSimulations } from '../../src/worker/serve';

/**
 * A worker in this thread: `serveSimulations` on one end of an in-process channel that
 * delivers each message on a later macrotask, as `postMessage` does. It runs the exact
 * worker code with an injected spin, without a real thread.
 */
export function loopbackWorker(spin: SpinFunction, log?: ToWorker[]): WorkerHandle {
  const toWorker = new Set<(m: ToWorker) => void>();
  const fromWorker = new Set<(m: FromWorker) => void>();
  let alive = true;
  const later = (fn: () => void): void => void setTimeout(() => alive && fn(), 0);
  const copy = <T>(m: T): T => structuredClone(m);

  const inside: Endpoint<ToWorker, FromWorker> = {
    postMessage: (m) => later(() => fromWorker.forEach((l) => l(copy(m)))),
    onMessage: (l) => (toWorker.add(l), () => toWorker.delete(l)),
  };
  serveSimulations(inside, spin, { yieldToEvents: () => new Promise((r) => setTimeout(r, 0)) });

  return {
    postMessage: (m) => {
      log?.push(m);
      later(() => toWorker.forEach((l) => l(copy(m))));
    },
    onMessage: (l) => (fromWorker.add(l), () => fromWorker.delete(l)),
    terminate: () => {
      alive = false;
    },
  };
}
