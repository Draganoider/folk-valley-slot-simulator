import { useEffect, useState } from 'react';
import type { GameConfig, TheoreticalReport } from '../../engine';
import type { AnalyseMessage, AnalysisReply } from '../../worker/analysis.worker';

/**
 * The analyser's report for the shipped configuration, computed once per page in a Web
 * Worker (`src/worker/analysis.worker.ts`). `analyse` takes about four seconds, so it runs
 * off the main thread, and only once the panel is first opened: a player who never opens it
 * spends nothing on it. Every later opening reuses the same report.
 */
export type TheoreticalState =
  | { readonly status: 'idle' }
  | { readonly status: 'computing' }
  | { readonly status: 'ready'; readonly report: TheoreticalReport }
  | { readonly status: 'error'; readonly message: string };

const cache = new Map<string, Promise<TheoreticalReport>>();

function analyseInWorker(config: GameConfig): Promise<TheoreticalReport> {
  const cached = cache.get(config.id);
  if (cached !== undefined) return cached;
  const promise = new Promise<TheoreticalReport>((resolve, reject) => {
    const worker = new Worker(new URL('../../worker/analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<AnalysisReply>) => {
      worker.terminate();
      if (event.data.type === 'report') resolve(event.data.report);
      else reject(new Error(event.data.message));
    });
    worker.addEventListener('error', (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The analysis worker failed to start.'));
    });
    const message: AnalyseMessage = { type: 'analyse', config };
    worker.postMessage(message);
  });
  // A failure is not cached, so opening the panel again retries.
  promise.catch(() => cache.delete(config.id));
  cache.set(config.id, promise);
  return promise;
}

export function useTheoretical(config: GameConfig, enabled: boolean): TheoreticalState {
  const [state, setState] = useState<TheoreticalState>({ status: 'idle' });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState((s) => (s.status === 'ready' ? s : { status: 'computing' }));
    // The promise is cached, so closing and reopening the panel mid-analysis waits on the same run.
    analyseInWorker(config).then(
      (report) => {
        if (live) setState((s) => (s.status === 'ready' && s.report === report ? s : { status: 'ready', report }));
      },
      (error: unknown) => {
        if (live) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [config, enabled]);
  return state;
}
