# `src/ui/stats/` — the statistics panel

What [`math-targets.md`](../../../docs/research/math-targets.md) section 7 asks for, in three
separate, labelled sections ([`AGENTS.md`](../../../AGENTS.md) rule 6): the odds as the
analyser computes them, the player's own spins, and simulations. `App.tsx` mounts it once,
`<StatsPanel finishedSpin={…} />`, below the game; a button opens and closes it.

| File | Owns |
|---|---|
| [`StatsPanel.tsx`](StatsPanel.tsx) | The panel: the toggle, the plain-language explanations, the three sections. Stays mounted while closed |
| [`sections.tsx`](sections.tsx) | `TheoreticalSection`, `ObservedSection`, `SimulateSection` |
| [`tables.tsx`](tables.tsx) | Tables with row and column headers, the distribution chart, `Num` (shown text plus a spoken form) |
| [`figures.ts`](figures.ts) | The data shaping: `theoreticalView`, `observedView`, `compareToTheory`. Pure |
| [`format.ts`](format.ts) | Percentages, × bet, "1 in N", exponents, z-scores, each with a spoken form. Pure |
| [`observed-session.ts`](observed-session.ts) | The player's spins since the page opened, as the engine's `SimulationStats`. Pure |
| [`simulation-job.ts`](simulation-job.ts) | The run sizes, lane length and worker count. Pure |
| [`use-theoretical.ts`](use-theoretical.ts) | Runs `analyse` in [`analysis.worker.ts`](../../worker/analysis.worker.ts) once per page |
| [`use-simulation.ts`](use-simulation.ts) | Runs a simulation with `runInWorkers`, with progress and cancel |

The pure modules use no DOM or React, so `tests/ui/stats.test.ts` tests them in Node;
`tests/e2e/stats.spec.ts` tests the panel in a browser.

## Decisions

- **The analysis runs in a worker, when the panel first opens.** `analyse(config)` takes about
  4 s. Precomputing it at build time would make the panel instant, but needs a build step and a
  generated file to keep in step with the configuration; a worker needs neither, and costs a
  player who never opens the panel nothing. The report is cached for the page's life.
- **Theoretical and observed never mix.** `theoreticalView` takes only a report labelled
  theoretical; `observedView` only a summary labelled observed, and ignores its `theoretical`
  slots; every label says "Theoretical", "Observed" or "Simulated". The z-scores in
  `compareToTheory` come from `checkTolerance` in `verify.ts`, with the analyser's σ (the σ for
  consecutive spins for the RTP, a Bernoulli σ for rates), and sit in their own column.
- **The cap.** The max win is shown as 2,500× bet with the analyser's chance of reaching it
  (about 1 in 10¹⁶) and a plain note that it is a bound, not a realistic outcome (DR-013).
- **The player's session counts a spin when it has finished showing**, so the figures never
  give away a result before the reels. A paid spin costs the same coins at every bet level, so
  changing the bet keeps counting; a new seed starts a new session, because the statistics
  take one seed's spins in order. It is kept in memory: a reload starts again.
- **Simulations** use a random seed each run, shown with the command that repeats it, lanes of
  100,000 spins, and up to four workers (one per lane, one core left free). The worker count
  never changes the result. A cancelled run shows what was played, marked partial.
- **No chart library.** The payout distribution is a table whose last column draws a bar on a
  log scale: the table is the text alternative, the bars are `aria-hidden`.
