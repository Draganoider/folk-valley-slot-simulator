import { analyse, assertValidConfig } from '../engine';
import type { TheoreticalReport } from '../engine';

/**
 * The browser Web Worker that runs `analyse(config)` once for the statistics panel. The
 * analysis takes about four seconds on the shipped configuration, too long for the main
 * thread, and is cheap enough that precomputing it at build time is not worth a build step.
 *
 * One message in, one out: `{ type: 'analyse', config }` answers `{ type: 'report', report }`
 * or `{ type: 'error', message }`. The report is plain data, every figure labelled
 * theoretical. Typed by hand like `simulation.worker.ts`: no DOM library in `tsconfig.json`.
 */
export interface AnalyseMessage {
  readonly type: 'analyse';
  readonly config: unknown;
}

export type AnalysisReply =
  | { readonly type: 'report'; readonly report: TheoreticalReport }
  | { readonly type: 'error'; readonly message: string };

interface WorkerScope {
  postMessage(message: AnalysisReply): void;
  addEventListener(type: 'message', listener: (event: { data: AnalyseMessage }) => void): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.addEventListener('message', (event) => {
  if (event.data.type !== 'analyse') return;
  try {
    const config = assertValidConfig(event.data.config);
    scope.postMessage({ type: 'report', report: analyse(config, () => Date.now()) });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
