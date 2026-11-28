# Status

Where the build stands: what has landed, what is still to do, and the groundwork beside it.
The short version is in [`AGENTS.md`](../AGENTS.md); this page is the long one, kept out of
that file because every agent loads `AGENTS.md` into every session.

Update it when work lands on `test`.

## Milestones

Milestone 0 (repository, CI and docs skeleton) is done. Milestones 1 (game design research)
and 2 (engine and simulation) shipped together as `v0.2.0`, and the nightly analysis runs
from `main`. Milestone 3 (playable prototype) is code-complete on `test`.
See [`PLAN.md`](PLAN.md) for what each milestone means.

## Landed so far

- The repository skeleton: agent instructions, contributor docs, the plan with decision
  records DR-001 to DR-004, the hygiene checks CI runs, and the release tooling.
- Milestone 0: hygiene CI green on `test` and `main`.
- Milestone 1 research: mechanics, math targets, rendering and art direction, in
  [`research/`](research/), with decision records DR-005 to DR-010.
- Milestone 2, the engine (see [`src/engine/README.md`](../src/engine/README.md)):
  - the foundation: scaffold, seeded RNG, configuration and validator, injury catalogue,
    result format and the `Engine` CI workflow (PR #1, DR-011);
  - the 243-ways evaluator (PR #2);
  - the trick feature, Scar Card, Session and the full `spin()` (PR #3, DR-012);
  - the simulation runner, statistics, workers and `npm run simulate` (PR #4);
  - the exact analyser, the tuned configuration `folk-valley-96-v1` at a theoretical
    95.997% RTP meeting every DR-006 target, engine-against-analyser tests,
    `npm run verify:long` and a nightly workflow (PR #5, DR-013). A 10⁸-spin seeded run
    agrees with the analyser (see [`findings.md`](findings.md)).
- Milestone 3, the playable prototype: the presentation timeline and its player (PR #6,
  DR-014), the app shell with the placeholder reel scene (PR #7), the animation spike (PR #8,
  DR-015: rigs for motion, painted held frames after the cut), the scene driven by the
  timeline with turbo, skip and the gore setting (PR #10), and the statistics panel with
  theoretical, observed and simulated figures kept apart (PR #9). CI builds the app and runs
  the browser tests.

## Not done yet

- Open from DR-013: the 2,500× cap is effectively unreachable (about 10⁻¹⁶ per spin).
  Whether a reachable top prize matters is the owner's call.
- Milestone 4: the `broken`-level ComfyUI trial (DR-015) waits for the owner's key in `.env`.

## Groundwork beside the milestones
