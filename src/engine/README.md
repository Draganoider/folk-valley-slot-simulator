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
| [`evaluate.ts`](evaluate.ts) | `evaluateWays` (243 ways), `countFlyers`, and the profile form the analyser enumerates with | Done |
| [`features.ts`](features.ts) | `resolveBaseTrick` and `resolveSession` | Seam: TODO for the features work |
| [`spin.ts`](spin.ts) | `spin(config, state, request)`, which wires the rest together | Seam: TODO, with the order to wire it in |
| [`analyser.ts`](analyser.ts) | `analyse(config)`, every theoretical figure | Seam: TODO for the analyser |

The Web Worker simulation lives in `src/worker/` (not created yet) and calls `spin`.

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

## Win evaluation

[`evaluate.ts`](evaluate.ts) pays 243 ways, left to right (DR-005):

- A win needs the symbol or the Kicker on reels 1, 2 and 3 at least, in any row, and extends
  over each further adjacent reel that has one. Only the longest run per symbol pays; different
  symbols' wins add.
- Ways are the product of matching positions per reel, wilds included; a win is pay × ways
  integer coins, before any multiplier (DR-011). Reels a landing turns wild (`wildReels`)
  match every row.
- The Kicker substitutes for everything but the Flyer and pays nothing by itself: a win
  starts from a real symbol on reel 1, so wild-only wins never pay. The configuration already
  keeps the Kicker and landed wild reels off reel 1; the evaluator would still count a reel-1
  wild only beside a real symbol of the win.
- The Flyer pays nothing; `countFlyers` counts it anywhere on the grid as stopped.
- Wins come in configuration symbol order, each with every position taking part (reel by
  reel, top row first) for highlighting.

Two forms of the same rules:

- **`evaluateWays(config, grid, wildReels)`** builds the `WaysWin` records for the spin
  result. It checks the grid's shape, its symbols and the wild reels, and throws
  `RangeError` on a bad one.
- **The profile form**, for hot loops. `waysTable(config)` compiles a configuration once
  (cached per config object). `profileWindow` reduces one reel's window to a count per paying
  symbol (`wildReelProfile` for a fully wild reel), and `waysCoins(table, profiles)` turns one
  profile per reel into total coins with no allocation. A reel's profile depends only on its
  window, so the analyser profiles each reel's `distinctWindows(strip, rows)` once and walks
  their combinations, weighting each by the product of the windows' stop counts. A test
  checks this against every stop combination of a toy configuration.

Speed, measured on one development machine with Node 24: about 0.35 µs per `evaluateWays` call on the
placeholder strips, and about 40 ns per combination in the profile form (the placeholder's
30.5 million distinct-window combinations take about 1.3 s).

## Seams for the rest of milestone 2

The files marked as seams above have their signatures and a `TODO` saying what to build.
Two things to settle while filling them in, and to write down here:

- **The draw order** within each stream. `drawStops` draws one `nextInt` per reel, reel 1
  first; everything after it (rider, tier, land or bail, extra wild reels, the Session) is
  for the features work to fix, and a golden full-spin test should pin it.
- **A spin that both fills the Scar Card and shows 3+ Flyers.** `SessionTrigger` allows one
  trigger per paid spin, as a Session is never retriggered; decide which wins, or whether
  the card's mark is kept for later, and record it.

## Tests

`tests/engine/` holds the unit tests: `npm test`. The RNG's golden vectors came from an
independent Python implementation of the reference algorithms; a failing vector means the
output changed, which is a new version, not a fix to the test.
