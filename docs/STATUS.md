# Status

Where the build stands: what has landed, what is still to do, and the groundwork beside it.
The short version is in [`AGENTS.md`](../AGENTS.md); this page is the long one, kept out of
that file because every agent loads `AGENTS.md` into every session.

Update it when work lands on `test`.

## Milestones

Milestone 0 (repository, CI and docs skeleton) is done, milestone 1 (game design
research) is done apart from its release, and milestone 2 (engine and simulation) is starting. See [`PLAN.md`](PLAN.md) for what
each milestone means.

## Landed so far

- The repository skeleton: agent instructions, contributor docs, the plan with decision
  records DR-001 to DR-004, the hygiene checks CI runs, and the release tooling.
- Milestone 0: hygiene CI green on `test` and `main`.
- Milestone 1 research: mechanics, math targets, rendering and art direction, in
  [`research/`](research/), with decision records DR-005 to DR-010.
- Milestone 2 engine foundation: the TypeScript and Vitest scaffold, the seeded RNG with
  golden vectors, the configuration types and validator, the injury catalogue, an untuned
  placeholder configuration, the spin result format, and the `Engine` CI workflow running
  typecheck and unit tests (DR-011). See [`src/engine/README.md`](../src/engine/README.md).

- Milestone 2 so far: the engine foundation (PR #1, DR-011), the 243-ways evaluator (PR #2),
  the trick feature, Scar Card, Session and the full `spin()` (PR #3, DR-012), and the
  simulation runner, statistics, workers and `npm run simulate` CLI (PR #4). The placeholder
  configuration is untuned: it simulates about 73% RTP and fires features far too often
  (see [`findings.md`](findings.md)).

## Not done yet

- Milestone 1: research done and DR-005 to DR-010 accepted. The `0.1.0` release is
  deferred by the owner.
- Milestone 2, the engine and simulation, is under way. Still to build on the foundation:
  the base-game ways evaluator, the trick and Session features with `spin()`, the Web Worker
  simulation, the exact analyser with a tuned configuration, and the nightly analysis
  workflow (DR-010). The seams are listed in [`src/engine/README.md`](../src/engine/README.md).

## Groundwork beside the milestones
