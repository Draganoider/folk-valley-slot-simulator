import type { GameConfig } from './config';
import type { FlyerCount, Grid, WaysWin } from './result';

/**
 * Base-game win evaluation: 243 ways, left to right (DR-005).
 *
 * TODO(base-game evaluator session): implement both functions and their hand fixtures.
 */

/**
 * Every ways win on `grid`, with the reels in `wildReels` treated as fully wild.
 *
 * Rules to implement: a win needs the symbol or the Kicker on reels 1, 2 and 3 at least, in
 * any row; it extends over each further adjacent reel that has one. Ways are the product of
 * matching positions per reel, wilds included, and the win is pay × ways. Only the longest
 * run per symbol pays, and different symbols' wins add. The Kicker substitutes for every
 * symbol except the Flyer and pays nothing by itself, so a win always starts from a real
 * symbol on reel 1. The Flyer pays nothing.
 *
 * Pure and deterministic: no draws.
 */
export function evaluateWays(
  config: GameConfig,
  grid: Grid,
  wildReels: readonly number[],
): WaysWin[] {
  void config;
  void grid;
  void wildReels;
  throw new Error('TODO: evaluateWays is not implemented yet (milestone 2, base-game evaluator).');
}

/** The Session Flyers visible on `grid`, anywhere. */
export function countFlyers(config: GameConfig, grid: Grid): FlyerCount {
  void config;
  void grid;
  throw new Error('TODO: countFlyers is not implemented yet (milestone 2, base-game evaluator).');
}
