import type { SimulationJob, SimulationOutcome } from '../engine';

/**
 * The messages between a page (or the Node CLI) and a simulation worker. Plain data only,
 * so they pass through `postMessage` in a browser and in `worker_threads` alike.
 */

/** Starts a run. `config` is checked with `assertValidConfig` inside the worker. */
export interface RunMessage {
  readonly type: 'run';
  readonly id: string;
  readonly config: unknown;
  readonly job: SimulationJob;
  /** Spins between progress messages and chances to see a cancel. */
  readonly batchSize?: number;
}

/** Stops a run after the batch in progress; the worker answers with a cancelled `done`. */
export interface CancelMessage {
  readonly type: 'cancel';
  readonly id: string;
}

export type ToWorker = RunMessage | CancelMessage;

export interface ProgressMessage {
  readonly type: 'progress';
  readonly id: string;
  readonly completed: number;
  readonly count: number;
}

/** The run's outcome; `outcome.cancelled` says whether it was stopped early. */
export interface DoneMessage {
  readonly type: 'done';
  readonly id: string;
  readonly outcome: SimulationOutcome;
}

/** The id of an error that concerns the worker itself, and so every run on it. */
export const WORKER_FAILED = '*';

export interface ErrorMessage {
  readonly type: 'error';
  readonly id: string;
  readonly message: string;
}

export type FromWorker = ProgressMessage | DoneMessage | ErrorMessage;

/**
 * One side of a message channel, whatever carries it: a browser worker's global scope or
 * `Worker` object, a `worker_threads` port, or an in-process pair in tests. `onMessage`
 * returns a function that removes the listener.
 */
export interface Endpoint<In, Out> {
  postMessage(message: Out): void;
  onMessage(listener: (message: In) => void): () => void;
}

/** A worker seen from the side that starts runs. */
export interface WorkerHandle extends Endpoint<FromWorker, ToWorker> {
  terminate(): void;
}
