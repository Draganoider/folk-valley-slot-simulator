import { FLYERS_TO_TRIGGER, maxWinCoins, type GameConfig } from './config';
import { DEFAULT_EVALUATOR, resolveBaseTrick, resolveSession, type WinEvaluator } from './features';
import { drawStops, gridFromStops } from './grid';
import { RESULT_FORMAT_VERSION, type SessionResult, type SessionTrigger, type SpinResult } from './result';
import { RNG_VERSION, formatSeed, parseSeed, spinStreams, type SpinStreams } from './rng';
import { nextScarCard, scarCardMarks, withScarCardMarks, type PlayerState } from './state';

/** What the player asks for: one paid spin. */
export interface SpinRequest {
  /** Canonical 16-digit hex master seed of the player's session or the simulation run. */
  readonly masterSeed: string;
  /** 0-based index of this paid spin under that seed. Free spins are not paid spins. */
  readonly spinIndex: number;
  /** Credits per coin; one of `config.bet.levels`. */
  readonly betLevel: number;
}

export interface SpinOutcome {
  readonly result: SpinResult;
  /** The state after the spin: only the played bet level's Scar Card can differ. */
  readonly state: PlayerState;
}

/**
 * One paid spin, start to finish: a pure function of (config, state, request). The config
 * must already have passed `validateConfig`. The state is not changed; the new one is returned.
 *
 * In order (the draw order is in src/engine/README.md):
 *  1. `spinStreams(parseSeed(masterSeed), spinIndex)`.
 *  2. Base stops with `drawStops(outcome, config.reels)`, then `gridFromStops`.
 *  3. `resolveBaseTrick`, then `evaluateWays` with its wild reels, times its multiplier.
 *  4. `countFlyers`; 3 or more start a Session from Flyers.
 *  5. The Scar Card (`nextScarCard`): a bail adds a mark; a filled card starts a Session and
 *     resets, unless Flyers already start one, when it holds the last mark back.
 *  6. The Session, if any, resolved in full by `resolveSession` with what is left under the cap.
 *  7. The max-win cap on the whole paid spin, and `capped`.
 *
 * @param evaluator The win evaluation; the one in `evaluate.ts` unless a test injects a stub.
 */
export function spin(
  config: GameConfig,
  state: PlayerState,
  request: SpinRequest,
  evaluator: WinEvaluator = DEFAULT_EVALUATOR,
): SpinOutcome {
  const master = parseSeed(request.masterSeed);
  return spinWithStreams(config, state, request, spinStreams(master, request.spinIndex), evaluator);
}

/**
 * {@link spin} with its two streams given instead of derived from the seed. `spin` is this
 * with `spinStreams(parseSeed(masterSeed), spinIndex)`; the analyser's exact toy test drives
 * it with scripted streams to walk every possible sequence of draws. Play uses `spin`.
 */
export function spinWithStreams(
  config: GameConfig,
  state: PlayerState,
  request: SpinRequest,
  streams: SpinStreams,
  evaluator: WinEvaluator = DEFAULT_EVALUATOR,
): SpinOutcome {
  const { betLevel, spinIndex } = request;
  const marksBefore = scarCardMarks(config, state, betLevel);
  const master = parseSeed(request.masterSeed);

  const stops = drawStops(streams.outcome, config.reels);
  const grid = gridFromStops(config.reels, stops, config.grid.rows);
  const attempt = resolveBaseTrick(config, grid, streams);
  const wins = evaluator.evaluateWays(config, grid, attempt?.wildReels ?? []);
  let baseCoins = 0;
  for (const w of wins) baseCoins += w.coins;
  baseCoins *= attempt?.winMultiplier ?? 1;
  const flyers = evaluator.countFlyers(config, grid);

  const flyersTrigger = flyers.count >= FLYERS_TO_TRIGGER;
  const card = nextScarCard(config, marksBefore, attempt?.outcome === 'bailed', flyersTrigger);

  let trigger: SessionTrigger | null = null;
  if (flyersTrigger) trigger = { kind: 'flyers', count: flyerTriggerCount(flyers.count) };
  else if (card.filled) trigger = { kind: 'scar-card' };

  const cap = maxWinCoins(config);
  let session: SessionResult | null = null;
  if (trigger !== null) {
    session = resolveSession(config, trigger, streams, cap - baseCoins, evaluator);
  }
  const uncapped = baseCoins + (session?.totalWinCoins ?? 0);
  const totalWinCoins = Math.min(uncapped, cap);

  const result: SpinResult = {
    formatVersion: RESULT_FORMAT_VERSION,
    rngVersion: RNG_VERSION,
    configId: config.id,
    masterSeed: formatSeed(master),
    spinIndex,
    betLevel,
    costCoins: config.bet.coinsPerSpin,
    base: { stops, grid, attempt, flyers, wins, winCoins: baseCoins },
    scarCard: {
      betLevel,
      size: config.scarCard.size,
      before: marksBefore,
      after: card.after,
      filled: card.filled,
    },
    session,
    totalWinCoins,
    capped: uncapped >= cap,
  };
  return { result, state: withScarCardMarks(state, betLevel, card.after) };
}

function flyerTriggerCount(count: number): 3 | 4 | 5 {
  if (count === 3 || count === 4 || count === 5) return count;
  throw new RangeError(`A grid shows at most five Flyers, one per reel; got ${count}.`);
}
