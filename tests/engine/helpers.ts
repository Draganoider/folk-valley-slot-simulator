import {
  PLACEHOLDER_CONFIG,
  assertValidConfig,
  type FlyerCount,
  type GameConfig,
  type Grid,
  type Position,
  type WaysWin,
  type WinEvaluator,
} from '../../src/engine';

/**
 * Test helpers for the features and the spin. The real evaluator (`evaluate.ts`) is built in
 * parallel, so these tests inject a stub with simple, hand-checkable rules instead.
 */

/** A mutable deep copy of the placeholder. Untyped on purpose, so a test can change anything. */
type Loose = any;

/** The placeholder with `change` applied, checked by the validator so every variant is a legal game. */
export function variant(change: (c: Loose) => void, id = 'test-variant'): GameConfig {
  const c: Loose = JSON.parse(JSON.stringify(PLACEHOLDER_CONFIG));
  c.id = id;
  change(c);
  assertValidConfig(c);
  return c as GameConfig;
}

/** Every Flyer on the grid, reel by reel. */
export function scanFlyers(grid: Grid): FlyerCount {
  const positions: Position[] = [];
  grid.forEach((col, reel) => col.forEach((s, row) => s === 'flyer' && positions.push({ reel, row })));
  return { count: positions.length, positions };
}

/**
 * A stub evaluator. Every grid pays one win of `coinsPerGrid` coins plus `perWildReel` for each
 * reel a landing turned wild, so a test can tell what the features passed in. Flyers are
 * counted for real unless `flyers` forces a count.
 */
export function stubEvaluator(
  options: { coinsPerGrid?: number; perWildReel?: number; flyers?: number } = {},
): WinEvaluator & { calls: { grid: Grid; wildReels: readonly number[] }[] } {
  const coinsPerGrid = options.coinsPerGrid ?? 1;
  const perWildReel = options.perWildReel ?? 10;
  const calls: { grid: Grid; wildReels: readonly number[] }[] = [];
  return {
    calls,
    evaluateWays(_config, grid, wildReels) {
      calls.push({ grid, wildReels: [...wildReels] });
      const coins = coinsPerGrid + perWildReel * wildReels.length;
      if (coins === 0) return [];
      const win: WaysWin = {
        symbol: 'gramps',
        length: 3,
        ways: coins,
        payPerWay: 1,
        coins,
        positions: [{ reel: 0, row: 0 }],
      };
      return [win];
    },
    countFlyers(_config, grid) {
      if (options.flyers === undefined) return scanFlyers(grid);
      const positions = Array.from({ length: options.flyers }, (_, reel) => ({ reel, row: 0 }));
      return { count: options.flyers, positions };
    },
  };
}

/** A 5×3 grid from rows of symbols, written top row first as it looks on screen. */
export function gridFromRows(rows: readonly (readonly string[])[]): Grid {
  const reels = rows[0]?.length ?? 0;
  return Array.from({ length: reels }, (_, reel) => rows.map((row) => row[reel] as string));
}

export const SEED = '0123456789abcdef';
