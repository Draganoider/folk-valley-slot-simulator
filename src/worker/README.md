# `src/worker/` — where simulations run

High-volume simulations run off the main thread ([`AGENTS.md`](../../AGENTS.md) rule 5): in
a Web Worker in the browser, and in Node worker threads for the nightly job
([`docs/PLAN.md`](../../docs/PLAN.md) DR-010). Both hosts run the same code: the runner and
statistics in [`src/engine/simulate.ts`](../engine/simulate.ts) and
[`src/engine/stats.ts`](../engine/stats.ts), described in the
[engine README](../engine/README.md#simulation-and-statistics), behind one message protocol.
Only the transport and the way a host yields between batches differ.

## Files

| File | What it is |
|---|---|
| [`protocol.ts`](protocol.ts) | The messages: `run` and `cancel` in; `progress`, `done` and `error` out. Plain data. `Endpoint` and `WorkerHandle`, the one interface every transport implements |
| [`serve.ts`](serve.ts) | `serveSimulations(endpoint, spin, options)`: the worker side. Validates the config, plays the job in batches, posts progress, and checks for a cancel between batches |
| [`pool.ts`](pool.ts) | `runInWorkers(workers, config, job)`: splits a job with `splitJob`, one chunk per worker, and merges the outcomes in spin order. Returns the result and `cancel()` |
| [`simulation.worker.ts`](simulation.worker.ts) | The browser Web Worker entry, serving the engine's `spin` |
| [`browser.ts`](browser.ts) | `createBrowserWorker()`, a module Worker as a `WorkerHandle` |
| [`node/thread.ts`](node/thread.ts) | The Node `worker_threads` entry, the same `serveSimulations` |
| [`node/pool.ts`](node/pool.ts) | `createNodeWorker()`, a worker thread as a `WorkerHandle` |
| [`node/cli.ts`](node/cli.ts) | `npm run simulate`, the CLI |

## Exactly the same result on any number of workers

Spin *i* draws from its own derived stream (DR-011), so no worker needs another's random
numbers. The Scar Card is the only state between spins, so a job is cut only at **lane**
boundaries, where the card resets to empty (see the engine README). Each chunk then starts
from exactly the state a single thread would have there, and the statistics merge with
integer arithmetic only. The merged outcome equals `runSimulation` on one thread, field for
field, whatever the worker count. The tests check it with in-process workers, with real
Node threads and through the CLI.

**Cancel** stops each worker after the batch in progress (default 5,000 spins). Every
worker answers with what it played, marked cancelled. With one worker that is an exact
prefix of the run; with several, each chunk contributes its own prefix.

## `npm run simulate`

```text
npm run simulate -- --spins 10000000 --seed-text nightly-2026-11-25 --out .scratch/sim/run.json
```

| Option | Meaning | Default |
|---|---|---|
| `--spins N` | Paid spins to play | required |
| `--seed HEX` / `--seed-text TEXT` | Master seed, 16 hex digits, or made from text by `seedFromText` | `0000000000000000` |
| `--start N` | First spin index | 0 |
| `--bet L` | Bet level | the lowest |
| `--lane N` or `none` | The Scar Card resets every N spins; `none` is one lane, one thread | 1,000,000 |
| `--config FILE` | A configuration JSON, checked by `assertValidConfig` | the placeholder |
| `--workers N` | Worker threads. Never changes the result | CPUs − 1 |
| `--batch N` | Spins between progress reports and cancel checks | 5,000 |
| `--out FILE` | Where the JSON goes | stdout |
| `--spin-module FILE` | A module exporting `spin`, used instead of the engine's. For testing | |

Progress and timing go to stderr; the JSON on stdout is the same for the same inputs, so
two runs can be diffed. It records the RNG and stats format versions, the config id, the
seed (and its text and text-seed version), the job, whether the run was cancelled, and the
observed summary with every raw count. Every figure is labelled observed; theoretical
values come only from the analyser. Ctrl+C cancels and still writes what was played, with
exit code 130.

Until the real `spin()` lands the CLI exits 1 with its "not implemented" error.

## How the tests run workers

The unit tests run under Node, without a browser:

- **In-process workers** (`tests/support/loopback.ts`): `serveSimulations` on one end of an
  in-memory channel that delivers each message on a later task, structured-cloned, as
  `postMessage` does. This runs the real worker code with an injected fake spin, and is
  where the protocol, progress, cancel and errors are tested.
- **Real Node threads** (`tests/node/`): `createNodeWorker` with `--spin-module` pointed at the
  fake spin, and the CLI in a child process. These prove the threads and the CLI give the
  single-thread result.

`@vitest/web-worker` was not used. It runs the worker's code in the same thread behind a
`Worker` shim, so it would test no more than the in-process channel does, and would add a
dependency. The browser Worker itself (`browser.ts`, `simulation.worker.ts`) is not
exercised by the unit tests; the Playwright tests will cover it once there is a page.

## Typechecking

`npm run typecheck` runs three TypeScript programs, because Vitest's typings bring in
Node's and would otherwise let `src/` use Node globals unnoticed:

- `tsconfig.json`: `src/` except `src/worker/node/`. ES2022 only, no DOM and no Node, so a
  browser or Node global in the engine fails. The browser worker types the few globals it
  needs by hand.
- `tsconfig.test.json`: the tests and the Vitest config, with Node typings.
- `tsconfig.node.json`: `src/worker/node/`, with Node typings.

Node runs the TypeScript through [tsx](https://tsx.is), for the CLI and inside each worker
thread (`--import tsx`).
