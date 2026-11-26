# `src/presentation/`: from a spin result to a timeline

Pure TypeScript, like the engine: no React, PixiJS, browser global, audio or animation code,
tested in Node. It turns one finished `SpinResult` ([`src/engine/README.md`](../engine/README.md#the-spin-result))
into a `Timeline` of plain-data events, and plays that timeline on an injected clock. The
design is DR-007 and DR-014 in [`docs/PLAN.md`](../../docs/PLAN.md), with the beats from
[`docs/research/mechanics.md`](../../docs/research/mechanics.md) sections 4–6 and the player
from [`docs/research/rendering.md`](../../docs/research/rendering.md) sections 4 and 6.

**It never decides anything** ([`AGENTS.md`](../../AGENTS.md) rule 4). Every rider, trick,
outcome, injury, ladder value and amount in an event is copied from the result. The
timeline only orders and times it, and chooses how a beat is drawn (gore, reduced motion).
Same result and options, same timeline: there is no clock and no `Math.random` in it.

Import from [`index.ts`](index.ts).

## Modules

| File | Owns |
|---|---|
| [`events.ts`](events.ts) | The event types, `Timeline`, `TimelineOptions`, `TIMELINE_FORMAT_VERSION`, each kind's role |
| [`timings.ts`](timings.ts) | `DEFAULT_TIMINGS`: every beat's length, normally and under reduced motion, the count-up steps and the turbo factor |
| [`build.ts`](build.ts) | `buildTimeline(result, options?, timings?)` |
| [`player.ts`](player.ts) | `TimelinePlayer`, `ManualClock`, and the pure `activeAt`, `progressAt` and `sceneAt` |

## Using it

```ts
const timeline = buildTimeline(result, { gore: 'full', reducedMotion: false, turbo: false });
const player = new TimelinePlayer(timeline, rafClock);      // or new ManualClock() in tests
// each animation frame:
const frame = player.tick();
for (const e of frame.completed) renderer.applyEnd(e);      // every outcome passed, even on a jump
for (const e of frame.active) renderer.apply(e, frame.time - e.start);
announce(frame.entered.map((e) => e.narration));             // aria-live
// the controls:
player.setSpeed(2.5);        // turbo mid-spin
player.skipToNextPoint();    // "skip" stops after the reels, after a trick resolves, after the wins
player.skip();               // to the end
```

`sceneAt(timeline, t)` folds the events up to `t` into what the screen shows (the reels as
stopped, wild reels, the Scar Card, the ladder, spins left, the Session total and the win
meter), so seeking and playing reach the same state. At the end it equals `timeline.final`.

## The timeline

`Timeline` holds the result's identity (`configId`, `masterSeed`, `spinIndex`, `betLevel`),
the options, `bloodHidden`, `reelCount`, `initial` (the Scar Card before), `duration`,
`events` and `final` (the total win in coins and credits, `capped`, the Scar Card after, and
whether a Session played). It is plain data and survives `structuredClone` and JSON.

**Events run back to back.** Event *i* starts where event *i − 1* ends, at whole
milliseconds, and every duration is at least 1, so at most one event is active at any time
and every event is active at some time. Overlap between beats, if the art wants it, belongs
to the renderer.

Every event has:

| Field | Meaning |
|---|---|
| `id` | Its index in `events` |
| `kind` | The discriminant, below |
| `start`, `duration` | Presentation milliseconds |
| `role` | `motion` (only animates) or `information` (shows something the player must see) |
| `motion` | `reduced` under reduced motion: no camera move, shake, zoom or flash; a crossfade between key poses |
| `spin` | `{ phase: 'base' }` or `{ phase: 'session', index }` |
| `skipPoint` | Where "skip to next" may stop |
| `narration` | One short sentence for an `aria-live` region |

### Event kinds, in the order they occur

**The base spin**

| Kind | Role | Payload | When |
|---|---|---|---|
| `reels-spin-up` | motion | | Always |
| `reel-stop` | information | `reel`, `stop`, `symbols` (top row first) | Once per reel, left to right; the last is a skip point |
| `trick-approach` | motion | `rider`, `kicker` (null in the Session) | A Kicker showed |
| `trick` | information | `rider`, `trickId`, `tier` (base) or `rung` (Session) | Follows the approach; carries no outcome |
| `trick-land` | information | `rider`, `trickId` | The attempt landed |
| `wild-reels` | information | `reels` (Kicker's first), `winMultiplier` | A base landing; the wins after it are the re-evaluated ones |
| `bail-impact` | motion | `rider`, `animationId`, `cutAway: true` | The attempt bailed; cut away on contact, never show the impact |
| `injury` | information | `rider`, `level`, `injuryId`, `bloodHidden` | After every bail, at its level, except `broken` under gore Mild |
| `patch-up` | information | `rider`, `replaces`, `bloodHidden` | After every bail: the rider gets up okay |
| `win-highlight` | information | `symbol`, `length`, `ways`, `payPerWay`, `coins` (before the multiplier), `multiplier`, `positions` | Once per ways win, in the result's order |
| `spin-win` | information | `coins`, `credits`, `runningTotalCoins` (Session only) | The spin paid anything; `coins` is the result's `winCoins`, after the multiplier and the cap |
| `scar-card` | information | `change` (`mark`, `fill` or `hold`), `size`, `before`, `after` | The base attempt bailed; `hold` is DR-012's held last mark |

**The Session**, when the result has one

| Kind | Role | Payload | When |
|---|---|---|---|
| `session-trigger` | information | `trigger`, `positions` (the Flyers; empty for the card) | First |
| `session-intro` | information | `rider`, `startingSpins`, `startRung`, `ladder` | Second |
| `free-spin` | information | `index`, `spinsLeftBefore`, `ladder` (before) | Each free spin, then its `reels-spin-up` and `reel-stop`s, `trick-approach` and `trick` |
| `ladder-climb` | information | `from`, `to`, `topHeld` | After a Session `trick-land` |
| `pain` | information | `from`, `to`, `spinsAdded`, `spinsLeftAfter` | After a Session bail's `bail-impact`, `injury` and `patch-up` |
| | | | Then the spin's `win-highlight`s, multiplied by the ladder after the attempt, and its `spin-win` |
| `session-end` | information | `reason`, `spinsPlayed` | After the last free spin |
| `closing-card` | information | `rider`, `level` (`patched-up`), `injuryId`, `friendFilming: true`, `bloodHidden` | Every Session ends on it: the rider patched up, a friend filming on a phone (DR-010) |
| `session-total` | information | `coins`, `credits` | Last of the Session |

**The end**

| Kind | Role | Payload | When |
|---|---|---|---|
| `count-up` | information | `fromCoins: 0`, `toCoins`, `toCredits`, `capped` | Always the last event: the paid spin's whole win, the result's `totalWinCoins` |

Amounts are integer coins as in the result; credits are coins × `betLevel`.

## Options

`TimelineOptions` are presentation only. None of them adds, removes or changes an outcome.

- **`gore`** (DR-009). `full`, the default, shows every level, blood allowed. `mild` drops
  the `injury` event at `broken`; the bail's `patch-up` then has `replaces: { level: 'broken',
  injuryId }`, so the renderer shows the patched-up card in its place and narration still
  says it was a bad one. Every event with `bloodHidden` has it true, as has the timeline.
- **`reducedMotion`**. Every event is marked `motion: 'reduced'`. Motion beats (spin-up,
  approach, impact) shorten to a short still crossfade; information beats keep their full
  length, so nothing is shown too briefly to read.
- **`turbo`**. Every duration is divided by `timings.turboFactor` (2.5), rounded, at least
  1 ms. The player's `setSpeed` is the same idea at run time, for turning turbo on mid-spin.

## Timings

[`timings.ts`](timings.ts) is the one place to tune: a `BeatTiming { full, reduced }` per
kind, the count-up's length by the win as a multiple of the spin's cost (0.6 s below 1×
up to 6 s at 100× and above), a short beat for a zero win, and the turbo factor. A plain spin
runs about 2 s; the reasoning for each value is in the file. Pass different timings as
`buildTimeline`'s third argument to try them without editing the defaults.

## The player

`TimelinePlayer(timeline, clock, { speed?, paused? })` keeps a presentation time that
advances by clock time × speed on each `tick()`, clamped to the end. Each frame reports
`time`, `progress`, `active`, `entered` and `completed` (since the last frame, in order),
`done`, and the `scene`. Because `completed` lists every event passed, a long frame, a
high speed or `skip()` still visits every outcome-bearing event: nothing the result says is
hidden. `seek(t)` jumps; a jump back returns `rewound: true` with empty lists, and the
renderer redraws from `scene`. `pause()` and `resume()` stop and restart the clock's effect
(the app pauses on `visibilitychange`).

## Versioning

`TIMELINE_FORMAT_VERSION` is 1. A changed event shape, an added or removed kind, or a change
to the order above is a new version (DR-014); a tuned duration is not.

## Tests

`tests/presentation/` runs 20,000 seeded paid spins of `folk-valley-96-v1` and checks, under
every option: the kinds in order equal an independent statement of this README's order
(`sample.ts`), every value agrees with the result, the timeline is pure and plain data, Mild
hides `broken` and blood, reduced motion keeps every information beat, turbo scales every
duration, and the player visits every event exactly once and ends on the final state
however its frames fall, deterministically under a `ManualClock`.
