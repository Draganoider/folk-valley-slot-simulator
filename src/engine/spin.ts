import type { GameConfig } from './config';
import type { SpinResult } from './result';
import type { PlayerState } from './state';

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
 * must already have passed `validateConfig`.
 *
 * TODO(features session, once the evaluator lands): wire the pieces in this order.
 *  1. `spinStreams(parseSeed(masterSeed), spinIndex)`.
 *  2. Base stops with `drawStops(outcome, config.reels)`, then `gridFromStops`.
 *  3. `resolveBaseTrick`, then `evaluateWays` with its wild reels, times its multiplier.
 *  4. `countFlyers`; on a bail, add a mark to the bet level's Scar Card.
 *  5. A Session on 3+ Flyers or a full card (decide, and document, what happens when both
 *     happen on one spin), resolved in full by `resolveSession`; a filled card resets to 0.
 *  6. Apply the max-win cap to the total and set `capped`.
 *  7. Return the result and the state with the new Scar Card.
 */
export function spin(config: GameConfig, state: PlayerState, request: SpinRequest): SpinOutcome {
  void config;
  void state;
  void request;
  throw new Error('TODO: spin is not implemented yet (milestone 2).');
}
