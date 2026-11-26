import { Simulation, assertValidConfig } from '../engine';
import type { SpinFunction } from '../engine';
import type { Endpoint, FromWorker, RunMessage, ToWorker } from './protocol';

export interface ServeOptions {
  /**
   * Lets the host deliver pending messages, such as a cancel, between batches. In a browser
   * or Node worker this is a zero-delay timer; tests may pass anything that yields.
   */
  readonly yieldToEvents: () => Promise<void>;
  /** Default spins per batch when a run message names none. */
  readonly batchSize?: number;
}

export const DEFAULT_BATCH_SIZE = 5_000;

/**
 * The worker side: answers `run` and `cancel` messages on `endpoint`, playing spins with
 * `spin`. The same code serves a browser Worker, a Node worker thread and tests; only the
 * endpoint and the yield differ. Several runs may be in flight; each is identified by its id.
 */
export function serveSimulations(
  endpoint: Endpoint<ToWorker, FromWorker>,
  spin: SpinFunction,
  options: ServeOptions,
): () => void {
  const cancelled = new Set<string>();
  const running = new Set<string>();

  async function run(message: RunMessage): Promise<void> {
    const { id } = message;
    try {
      const config = assertValidConfig(message.config);
      const sim = new Simulation(spin, config, message.job);
      const batch = Math.max(1, Math.floor(message.batchSize ?? options.batchSize ?? DEFAULT_BATCH_SIZE));
      while (!sim.done) {
        await options.yieldToEvents();
        if (cancelled.has(id)) {
          endpoint.postMessage({ type: 'done', id, outcome: sim.outcome(true) });
          return;
        }
        sim.step(batch);
        endpoint.postMessage({ type: 'progress', id, completed: sim.completed, count: message.job.count });
      }
      endpoint.postMessage({ type: 'done', id, outcome: sim.outcome() });
    } catch (error) {
      endpoint.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
    } finally {
      running.delete(id);
      cancelled.delete(id);
    }
  }

  return endpoint.onMessage((message) => {
    if (message.type === 'cancel') {
      if (running.has(message.id)) cancelled.add(message.id);
    } else if (message.type === 'run') {
      if (running.has(message.id)) {
        endpoint.postMessage({ type: 'error', id: message.id, message: `Run ${message.id} is already running.` });
        return;
      }
      running.add(message.id);
      void run(message);
    }
  });
}
