# `src/engine/` — the slot math

Pure, seeded TypeScript ([`AGENTS.md`](../../AGENTS.md) rule 5): no UI framework, renderer,
browser global, audio or animation code. A paid spin is a function of the configuration,
the master seed, the spin index, the bet level and the Scar Card before it, and with the same
inputs it produces the same result. The design is in [`docs/PLAN.md`](../../docs/PLAN.md),
DR-005 (mechanics), DR-006 (math), DR-009 (injuries) and DR-011 (units, seeds and the result
format), with the detail in [`docs/research/mechanics.md`](../../docs/research/mechanics.md)
and [`docs/research/math-targets.md`](../../docs/research/math-targets.md).

`tsconfig.json` compiles with the ES2022 library only, no DOM and no Node typings, so a
browser or Node global used here fails `npm run typecheck`.

Import from [`index.ts`](index.ts); everything outside this folder should.

## Modules

| File | Owns | State |
|---|---|---|
| [`rng.ts`](rng.ts) | `xoshiro128**`, SplitMix64 seeding, one derived stream per paid spin and purpose, rejection-sampled `nextInt`, weighted picks, text seeds | Done; golden vectors pin it |
| [`config.ts`](config.ts) | The configuration types and constants: riders, disciplines, trick tiers, injury levels, units | Done |
| [`validate.ts`](validate.ts) | `validateConfig`, which takes `unknown` and reports every problem with its path; `assertValidConfig` | Done |
| [`injuries.ts`](injuries.ts) | `INJURY_CATALOGUE`, every injury id by level, the list reviewed against rule 8 | Done |
| [`placeholder-config.ts`](placeholder-config.ts) | A complete configuration that validates. **Untuned**: its numbers are guesses | Replaced when the analyser tunes it |
| [`result.ts`](result.ts) | The spin result format, presentation's only input | Done, format version 1 |
| [`state.ts`](state.ts) | `PlayerState`, the Scar Card marks per bet level, the only state between paid spins | Done |
| [`grid.ts`](grid.ts) | Drawing reel stops and reading the visible grid | Done |
| [`evaluate.ts`](evaluate.ts) | `evaluateWays` (243 ways) and `countFlyers` | Seam: TODO for the base-game evaluator |
| [`features.ts`](features.ts) | `resolveBaseTrick` and `resolveSession` | Seam: TODO for the features work |
| [`spin.ts`](spin.ts) | `spin(config, state, request)`, which wires the rest together | Seam: TODO, with the order to wire it in |
| [`analyser.ts`](analyser.ts) | `analyse(config)`, every theoretical figure | Seam: TODO for the analyser |
| [`stats.ts`](stats.ts) | Streaming, exactly mergeable statistics over spin results, and the observed summary | Done |
| [`simulate.ts`](simulate.ts) | The simulation runner over an injected spin function, lanes, `splitJob` and `mergeOutcomes` | Done |
| [`verify.ts`](verify.ts) | The DR-006 tolerance check (observed within 4·σ/√N of theoretical) and the seed-sweep check | Done |

The Web Worker and the Node CLI that host simulations live in [`src/worker/`](../worker/README.md);
the runner and statistics they use are here, in `simulate.ts` and `stats.ts`.

## Random numbers

- **Generator.** `xoshiro128**` 1.1, 128-bit state, 32-bit operations only. Its identifier,
  `RNG_VERSION = 'xoshiro128ss-v1'`, covers the generator, the seeding and the derivation,
  and is recorded in every result.
- **Master seed.** 64 bits, written as 16 lowercase hex digits (`parseSeed`, `formatSeed`).
  `seedFromText` turns text such as `sweep-2026-11-25-00` into one (FNV-1a 64 over UTF-8,
  then SplitMix64's mix; `TEXT_SEED_VERSION`).
- **One stream per paid spin.** Spin *i*'s seed is the (*i*+1)-th output of SplitMix64
  started from the master seed, so any spin is computed alone: a spin replays by itself, a
  feature's draws never shift later spins, and a worker pool that splits a run by index
  range gets the same results as one thread.
- **Two streams per spin.** The outcome stream (`spinStreams(...).outcome`) draws everything
  that decides value. The cosmetic stream draws trick names, bail animations and injury ids,
  so adding one changes no outcome. Each stream's seed is the spin seed XOR a fixed tag, and
  its state is the first two SplitMix64 outputs from that seed, which are never both zero.
- **Ranges.** `nextInt(n)` rejects draws at or above 2³² − (2³² mod n), so it is exactly
  uniform. `pickWeighted` draws `nextInt(total)` and walks the weights. Every probability
  in the game is integer weights drawn this way; floats never decide an outcome.
- **Changing any of it** is a new `RNG_VERSION` with new golden vectors, never an edit that
  makes the old vectors pass: old seeds must replay the same spins.

Not cryptographic and not certified; fit for an educational simulator.

## Configuration

`GameConfig` in [`config.ts`](config.ts) is the whole game, as plain data that survives a
JSON round trip:

- a 5×3 grid paying 243 ways, with four rider, four gear and five low symbols, the Kicker
  wild (reels 2–4 only) and the Session Flyer scatter (at most one per window);
- base and Session reel strips, and a paytable in coins per way for 3, 4 and 5 of a kind;
- rider weights, and the easy, medium and hard trick tiers with integer land and bail weights
  and what a landing does (extra wild reels, a win multiplier);
- the Scar Card's size, kept per bet level;
- the Session ladder: starting spins, start rungs by trigger, rungs with multipliers and odds,
  the pain limit of 3, and the spins a bail adds;
- injury levels (DR-009): base bails `scuffed`; Session pain 1, 2, 3 `scuffed`, `bleeding`,
  `broken`; every sequence closes `patched-up`. The gore setting is presentation-only and is
  not configuration;
- the cosmetic catalogue, and the max-win cap of 2,500× the cost of a spin.

`validateConfig` refuses, with a path and a reason, anything that breaks those rules: wrong
counts, unknown symbols, a Kicker on reel 1 or 5, two Flyers in one window, fractional pays
or weights, weights that cannot be drawn, a falling ladder, a `broken` injury below the pain
limit, an injury id outside `INJURY_CATALOGUE`, and more. It never clamps or rewrites.

**Units.** Amounts are integer coins. A paid spin costs `bet.coinsPerSpin` coins; the bet
level is credits per coin, so credits are coins × bet level. A ways win is pay × ways ×
multiplier, all integers.

## The spin result

[`result.ts`](result.ts) defines `SpinResult`, the record of one paid spin and everything
it triggered. Presentation reads it and never changes it (rule 4), and it holds everything
shown, so nothing is reconstructed. It is plain data: no functions, classes, Maps or
`undefined`, so it passes through `postMessage` and JSON unchanged.

```text
SpinResult
├─ formatVersion, rngVersion, configId, masterSeed, spinIndex   what replays it
├─ betLevel, costCoins
├─ base
│  ├─ stops, grid                          reel stops and the grid as stopped
│  ├─ attempt | null                       rider, tier, kicker position, trickId,
│  │                                       landed | bailed, wildReels, winMultiplier,
│  │                                       bail { animationId, injury { level, id } } | null
│  ├─ flyers { count, positions }
│  └─ wins[], winCoins                     each WaysWin: symbol, length, ways, payPerWay,
│                                          coins, positions
├─ scarCard { betLevel, size, before, after, filled }
├─ session | null
│  ├─ trigger (flyers 3/4/5 | scar-card), rider, startingSpins, startRung
│  ├─ spins[]                              stops, grid, attempt (rider, rung, trickId,
│  │                                       outcome, bail), ladderBefore/After (rung,
│  │                                       multiplier, pain), spinsLeftBefore, spinsAdded,
│  │                                       spinsLeftAfter, wins, winCoins, runningTotalCoins
│  ├─ endReason: spins-out | pain-limit | max-win
│  ├─ closing { level: patched-up, id }
│  └─ totalWinCoins
└─ totalWinCoins, capped                   after the 2,500× cap
```

A change to the shape is a new `RESULT_FORMAT_VERSION`.

## Seams for the rest of milestone 2

The files marked as seams above have their signatures and a `TODO` saying what to build.
Two things to settle while filling them in, and to write down here:

- **The draw order** within each stream. `drawStops` draws one `nextInt` per reel, reel 1
  first; everything after it (rider, tier, land or bail, extra wild reels, the Session) is
  for the features work to fix, and a golden full-spin test should pin it.
- **A spin that both fills the Scar Card and shows 3+ Flyers.** `SessionTrigger` allows one
  trigger per paid spin, as a Session is never retriggered; decide which wins, or whether
  the card's mark is kept for later, and record it.

## Simulation and statistics

Everything a simulation run counts, and how it is checked against the analyser. The hosts,
the Web Worker and `npm run simulate`, are in [`src/worker/`](../worker/README.md).

**The runner** ([`simulate.ts`](simulate.ts)). `runSimulation(spin, config, job)` plays
`job.count` paid spins from `job.masterSeed`, starting at `job.startIndex`, at one bet level,
and folds every result into the statistics. The spin function is a parameter, so the
worker, the CLI and the tests share one loop, the tests with a stand-in. `Simulation` is
the same loop driven in steps, which is how a worker answers a cancel between batches.

**Lanes.** A spin depends on the Scar Card before it, and the card on every earlier spin.
Each spin's random numbers stand alone (DR-011), but its state does not, so a run cannot
be cut anywhere and played in parallel. A run is therefore made of *lanes*: at every spin
index that is a multiple of `job.laneLength` the card is reset to empty, as if a new player
sat down, and inside a lane the card carries over exactly as in play. `splitJob` cuts only
at lane boundaries, where every chunk knows its starting state (empty), so the merged
result of any number of workers **equals the single-thread run exactly**, field for field;
the tests check it, and check that a cut ignoring the card is not exact.
`laneLength: null` is one lane: stationary play, but one thread. Starting each lane on an
empty card is a small transient bias against the analyser's stationary figures, about a
card's worth of bails per lane, so long runs use long lanes (the CLI's default is 10⁶).
Running each chunk from every possible card state would be exact for one lane too, at
`scarCard.size` times the work; it was not worth it.

**The statistics** ([`stats.ts`](stats.ts)). `SimulationStats` is plain data of integer
counts and sums: bet and win, Σwin² (as a wide integer, since it passes 2⁵³), hits, wins
above bet, even money, losses disguised as wins, the cap, the max win with its spin index,
the longest run without a payout, a win histogram in × bet, trick attempts, landings and
bails by tier, Scar Card marks and fills, Sessions by trigger (3, 4 or 5 Flyers, or the
card) with their spins, wins, attempts, end reasons and the distributions of length, final
multiplier and final rung, and every injury card shown. Add spins with `StatsAccumulator`;
`mergeStats(a, b)` combines two runs, `a`'s spins before `b`'s, and is exact because it
only adds integers (the drought and the max win merge by position). It refuses mixed
seeds, configs or costs, and overlapping or out-of-order ranges.

`summarise(stats)` gives the figures: observed RTP with its sample standard error and 95%
interval (normal approximation), σ per spin × bet, the hit, win-above-bet, LDW, trick,
Session and cap rates, the observed RTP split, the largest observed win and the histogram.
Each is an `ObservedFigure` — `{ kind: 'observed', value, theoretical }` — and `theoretical`
is null until `withTheoretical(summary, report)` fills it from values the analyser labelled
`kind: 'theoretical'`. Nothing here computes a theoretical value (rule 6).

**Verification** ([`verify.ts`](verify.ts)). `checkTolerance` and `assertWithinTolerance`
are DR-006's test, |observed − theoretical| ≤ 4·σ/√N, with the analyser's σ, never the
sample's (math-targets 6.2 says why); `bernoulliSigma(p)` gives σ for a rate. Both inputs
must be labelled theoretical. `checkSeedSweep(zScores)` judges K seeds' z-scores as a set:
mean within 4/√K of 0, variance within a band around 1.

## Tests

`tests/engine/` holds the unit tests: `npm test`. The RNG's golden vectors came from an
independent Python implementation of the reference algorithms; a failing vector means the
output changed, which is a new version, not a fix to the test.
