import {
  WILD_REELS,
  type GameConfig,
  type InjuryLevel,
  type LadderRung,
  type RiderDef,
  type SymbolKind,
} from './config';
import { countFlyers, evaluateWays } from './evaluate';
import { drawStops, gridFromStops } from './grid';
import type {
  BailDetail,
  BaseTrickAttempt,
  Grid,
  LadderState,
  Position,
  SessionAttempt,
  SessionResult,
  SessionSpin,
  SessionTrigger,
  WaysWin,
} from './result';
import type { Rng, SpinStreams } from './rng';

/**
 * The trick attempt in ordinary spins and the Session (DR-005, DR-012).
 *
 * Outcome draws (rider, tier, land or bail, the extra wild reels, the Session's stops and
 * attempts) come from `streams.outcome`; trick names, bail animations and injury ids from
 * `streams.cosmetic` only, so adding a cosmetic entry never changes an outcome. The draw
 * order is part of what a seed replays; it is written down in src/engine/README.md and the
 * golden full-spin test in tests/engine/spin.test.ts pins it.
 */

/**
 * The win evaluation the features call. `evaluate.ts` provides the real one; tests inject
 * a stub so the features can be tested on their own.
 */
export interface WinEvaluator {
  readonly evaluateWays: typeof evaluateWays;
  readonly countFlyers: typeof countFlyers;
}

/** The evaluator in `evaluate.ts`. */
export const DEFAULT_EVALUATOR: WinEvaluator = { evaluateWays, countFlyers };

/** The id of the one symbol of `kind` (the wild or the scatter); the validator ensures there is one. */
export function symbolOfKind(config: GameConfig, kind: SymbolKind): string {
  const symbol = config.symbols.find((s) => s.kind === kind);
  if (symbol === undefined) throw new Error(`The configuration has no ${kind} symbol.`);
  return symbol.id;
}

/** One entry of a non-empty list, uniformly: one `nextInt`. */
function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list.');
  return items[rng.nextInt(items.length)] as T;
}

/** Land or bail from a pair of weights: one `pickWeighted([land, bail])`. */
function drawLanded(rng: Rng, odds: { readonly land: number; readonly bail: number }): boolean {
  return rng.pickWeighted([odds.land, odds.bail]) === 0;
}

function drawRider(config: GameConfig, rng: Rng): RiderDef {
  return config.riders[rng.pickWeighted(config.riders.map((r) => r.weight))] as RiderDef;
}

/** A bail's cosmetic detail: animation, then injury id, both from the cosmetic stream. */
function drawBail(config: GameConfig, cosmetic: Rng, rider: RiderDef, level: InjuryLevel): BailDetail {
  const animationId = pickOne(cosmetic, config.cosmetics.bailAnimations[rider.discipline]);
  const id = pickOne(cosmetic, config.cosmetics.injuries[level]);
  return { animationId, injury: { level, id } };
}

/** The leftmost Kicker on the grid, topmost on its reel, or null. */
export function findKicker(config: GameConfig, grid: Grid): Position | null {
  const wild = symbolOfKind(config, 'wild');
  for (let reel = 0; reel < grid.length; reel++) {
    const row = (grid[reel] as readonly string[]).indexOf(wild);
    if (row >= 0) return { reel, row };
  }
  return null;
}

/**
 * The base-game attempt for a grid, or null when no Kicker is visible. The leftmost Kicker
 * starts it (topmost if a reel shows two).
 *
 * Outcome draws, in order: rider (`pickWeighted` over rider weights), tier (`pickWeighted`
 * over tier weights), land or bail (`pickWeighted([land, bail])`), then on a landing one
 * `nextInt` per extra wild reel, each picking from the wild-eligible reels not yet wild in
 * ascending order. Cosmetic draws, in order: the trick id, then on a bail the animation and
 * the injury id at `config.injuries.baseBail`.
 */
export function resolveBaseTrick(
  config: GameConfig,
  grid: Grid,
  streams: SpinStreams,
): BaseTrickAttempt | null {
  const kicker = findKicker(config, grid);
  if (kicker === null) return null;
  const { outcome, cosmetic } = streams;

  const rider = drawRider(config, outcome);
  const tier = config.trickTiers[outcome.pickWeighted(config.trickTiers.map((t) => t.weight))];
  if (tier === undefined) throw new Error('unreachable: the tier draw is within the tiers');
  const landed = drawLanded(outcome, tier.odds);

  let wildReels: number[] = [];
  let winMultiplier = 1;
  if (landed) {
    wildReels = [kicker.reel];
    const others = WILD_REELS.filter((r) => r !== kicker.reel);
    if (tier.landing.extraWildReels > others.length) {
      throw new RangeError(`Tier ${tier.id} asks for ${tier.landing.extraWildReels} extra wild reels; only ${others.length} are eligible.`);
    }
    for (let k = 0; k < tier.landing.extraWildReels; k++) {
      const [reel] = others.splice(outcome.nextInt(others.length), 1);
      wildReels.push(reel as number);
    }
    winMultiplier = tier.landing.winMultiplier;
  }

  const trickId = pickOne(cosmetic, config.cosmetics.tricks[rider.discipline][tier.id]);
  const bail = landed ? null : drawBail(config, cosmetic, rider, config.injuries.baseBail);

  return {
    rider: rider.id,
    tier: tier.id,
    kicker,
    trickId,
    outcome: landed ? 'landed' : 'bailed',
    wildReels,
    winMultiplier,
    bail,
  };
}

/** The rung a Session starts on for its trigger. */
export function startRungFor(config: GameConfig, trigger: SessionTrigger): number {
  const start = config.session.startRung;
  if (trigger.kind === 'scar-card') return start.scarCard;
  return trigger.count === 3 ? start.flyers3 : trigger.count === 4 ? start.flyers4 : start.flyers5;
}

function sumCoins(wins: readonly WaysWin[]): number {
  let total = 0;
  for (const w of wins) total += w.coins;
  return total;
}

/**
 * A whole Session, resolved before anything is shown.
 *
 * Outcome draws, in order: the Session's rider (`pickWeighted` over rider weights), then for
 * each free spin its stops (one `nextInt` per reel of `config.session.reels`, reel 1 first)
 * and its attempt from the current rung (`pickWeighted([land, bail])`). Cosmetic draws, in
 * order: for each free spin its trick id, then on a bail the animation and the injury id;
 * after the last spin the closing card's id.
 *
 * A landing climbs a rung (it stays on the top rung); a bail raises pain by one and, while
 * pain is below the limit, adds `extraSpinsPerBail` spins. The spin's ways win is multiplied
 * by the multiplier after its attempt. Kickers are wild (the evaluator treats them so) but
 * start no attempt. The Session ends after the spin where the paid spin's total reaches the
 * cap (`max-win`, which takes precedence and pays exactly the cap), where pain reaches the
 * limit (`pain-limit`), or where the spins run out (`spins-out`), and always closes with a
 * `config.injuries.closing` card.
 *
 * @param remainingCapCoins What the paid spin may still pay before it reaches the cap,
 *   after its base win. The Session stops and pays exactly this when it gets there; at 0 or
 *   less it plays no spins.
 */
export function resolveSession(
  config: GameConfig,
  trigger: SessionTrigger,
  streams: SpinStreams,
  remainingCapCoins: number,
  evaluator: WinEvaluator = DEFAULT_EVALUATOR,
): SessionResult {
  const { outcome, cosmetic } = streams;
  const session = config.session;
  const rows = config.grid.rows;
  const topRung = session.rungs.length - 1;
  const remaining = Math.max(0, remainingCapCoins);

  const rider = drawRider(config, outcome);
  const startRung = startRungFor(config, trigger);
  let ladder: LadderState = { rung: startRung, multiplier: rungAt(config, startRung).multiplier, pain: 0 };
  let spinsLeft = session.startingSpins;
  let total = 0;
  let endReason: SessionResult['endReason'] = 'spins-out';
  const spins: SessionSpin[] = [];

  if (remaining <= 0) endReason = 'max-win';

  while (remaining > 0 && spinsLeft > 0) {
    const stops = drawStops(outcome, session.reels);
    const grid = gridFromStops(session.reels, stops, rows);
    const rung = rungAt(config, ladder.rung);
    const landed = drawLanded(outcome, rung.odds);

    const ladderBefore = ladder;
    let spinsAdded = 0;
    let bail: BailDetail | null = null;
    const trickId = pickOne(cosmetic, config.cosmetics.tricks[rider.discipline][rung.trickTier]);
    if (landed) {
      const next = Math.min(ladder.rung + 1, topRung);
      ladder = { rung: next, multiplier: rungAt(config, next).multiplier, pain: ladder.pain };
    } else {
      const pain = ladder.pain + 1;
      ladder = { ...ladder, pain };
      if (pain < session.painLimit) spinsAdded = session.extraSpinsPerBail;
      const level = config.injuries.sessionPain[pain - 1];
      if (level === undefined) throw new Error(`No injury level for pain ${pain}.`);
      bail = drawBail(config, cosmetic, rider, level);
    }

    const wins = evaluator.evaluateWays(config, grid, []);
    const uncut = sumCoins(wins) * ladder.multiplier;
    const winCoins = Math.min(uncut, remaining - total);
    total += winCoins;
    const spinsLeftBefore = spinsLeft;
    spinsLeft = spinsLeft - 1 + spinsAdded;

    const attempt: SessionAttempt = {
      rider: rider.id,
      rung: ladderBefore.rung,
      trickId,
      outcome: landed ? 'landed' : 'bailed',
      bail,
    };
    spins.push({
      index: spins.length,
      stops,
      grid,
      attempt,
      ladderBefore,
      ladderAfter: ladder,
      spinsLeftBefore,
      spinsAdded,
      spinsLeftAfter: spinsLeft,
      wins,
      winCoins,
      runningTotalCoins: total,
    });

    if (total >= remaining) {
      endReason = 'max-win';
      break;
    }
    if (ladder.pain >= session.painLimit) {
      endReason = 'pain-limit';
      break;
    }
  }

  const closingLevel = config.injuries.closing;
  const closing = { level: closingLevel, id: pickOne(cosmetic, config.cosmetics.injuries[closingLevel]) };

  return {
    trigger,
    rider: rider.id,
    startingSpins: session.startingSpins,
    startRung,
    spins,
    endReason,
    closing,
    totalWinCoins: total,
  };
}

function rungAt(config: GameConfig, rung: number): LadderRung {
  const r = config.session.rungs[rung];
  if (r === undefined) throw new RangeError(`Rung ${rung} is outside the ladder of ${config.session.rungs.length}.`);
  return r;
}
