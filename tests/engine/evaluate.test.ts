import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_CONFIG,
  countFlyers,
  createRng,
  distinctWindows,
  drawStops,
  evaluateWays,
  gridFromStops,
  parseSeed,
  profileWindow,
  waysCoins,
  waysTable,
  wildReelProfile,
  type GameConfig,
  type Grid,
  type Rng,
  type WaysWin,
} from '../../src/engine';

const CFG = PLACEHOLDER_CONFIG;

const CODES: { readonly [code: string]: string } = {
  GR: 'gramps', KE: 'kerb', ZI: 'zip', DO: 'dot',
  HE: 'helmet', DE: 'deck', PE: 'pegs', BA: 'bars',
  BO: 'bolt', WR: 'wrench', GT: 'grip-tape', CO: 'cone', ST: 'sticker',
  KI: 'kicker', FL: 'flyer',
};

/** A grid from one string per reel, top row first: `g('GR BO CO', ...)`. */
function g(...reels: string[]): Grid {
  return reels.map((reel) =>
    reel.split(' ').map((code) => {
      const id = CODES[code];
      if (id === undefined) throw new Error(`Unknown code ${code}`);
      return id;
    }),
  );
}

function summary(wins: readonly WaysWin[]) {
  return wins.map(({ symbol, length, ways, payPerWay, coins }) => ({ symbol, length, ways, payPerWay, coins }));
}

function total(wins: readonly WaysWin[]): number {
  return wins.reduce((sum, w) => sum + w.coins, 0);
}

/**
 * Independent brute force: for each paying symbol, the longest length 5, 4 or 3 with any
 * matching tuple of positions (one row per reel, reel 1 real, the rest the symbol or wild),
 * and the number of such tuples. Enumerates up to rows^5 tuples instead of multiplying counts.
 */
function bruteForce(config: GameConfig, grid: Grid, wildReels: readonly number[]): Map<string, { length: number; ways: number }> {
  const wild = config.symbols.find((s) => s.kind === 'wild')?.id;
  const paying = config.symbols.filter((s) => s.kind !== 'wild' && s.kind !== 'scatter').map((s) => s.id);
  const rows = config.grid.rows;
  const result = new Map<string, { length: number; ways: number }>();
  for (const symbol of paying) {
    for (let length = grid.length; length >= 3; length--) {
      let ways = 0;
      const tuples = rows ** length;
      for (let t = 0; t < tuples; t++) {
        let rest = t;
        let ok = true;
        for (let reel = 0; reel < length && ok; reel++) {
          const row = rest % rows;
          rest = Math.floor(rest / rows);
          const id = grid[reel]?.[row];
          const isWild = wildReels.includes(reel) || id === wild;
          if (reel === 0) ok = !wildReels.includes(0) && (grid[0] ?? []).includes(symbol) && (id === symbol || id === wild);
          else ok = isWild || id === symbol;
        }
        if (ok) ways++;
      }
      if (ways > 0) {
        result.set(symbol, { length, ways });
        break;
      }
    }
  }
  return result;
}

function expectMatchesBruteForce(config: GameConfig, grid: Grid, wildReels: readonly number[]): void {
  const wins = evaluateWays(config, grid, wildReels);
  const brute = bruteForce(config, grid, wildReels);
  expect(wins.map((w) => [w.symbol, w.length, w.ways])).toEqual(
    [...brute.entries()].map(([symbol, { length, ways }]) => [symbol, length, ways]),
  );
}

/** The fast form's total for a grid, through profiles. */
function profileTotal(config: GameConfig, grid: Grid, wildReels: readonly number[]): number {
  const table = waysTable(config);
  const profiles = grid.map((window, reel) =>
    wildReels.includes(reel) ? wildReelProfile(table, reel === 0) : profileWindow(table, window, reel === 0),
  );
  return waysCoins(table, profiles);
}

describe('evaluateWays: hand fixtures', () => {
  it('pays nothing when no symbol reaches reel 3', () => {
    const grid = g('GR KE ZI', 'DO HE DE', 'GR KE ZI', 'GR KE ZI', 'GR KE ZI');
    expect(evaluateWays(CFG, grid, [])).toEqual([]);
  });

  it('pays one way for a single three of a kind, with its positions', () => {
    const grid = g('GR BO CO', 'WR GR ST', 'HE DE GR', 'PE BA DO', 'KE ZI GT');
    expect(evaluateWays(CFG, grid, [])).toEqual([
      {
        symbol: 'gramps', length: 3, ways: 1, payPerWay: 10, coins: 10,
        positions: [{ reel: 0, row: 0 }, { reel: 1, row: 1 }, { reel: 2, row: 2 }],
      },
    ]);
  });

  it('multiplies ways per reel, substitutes the Kicker and pays several symbols at once', () => {
    const grid = g('GR GR BO', 'GR KI ST', 'GR BO GR', 'GR CO WR', 'DE HE PE');
    const wins = evaluateWays(CFG, grid, []);
    expect(summary(wins)).toEqual([
      { symbol: 'gramps', length: 4, ways: 8, payPerWay: 25, coins: 200 },
      { symbol: 'bolt', length: 3, ways: 1, payPerWay: 1, coins: 1 },
    ]);
    expect(wins[0]?.positions).toEqual([
      { reel: 0, row: 0 }, { reel: 0, row: 1 },
      { reel: 1, row: 0 }, { reel: 1, row: 1 },
      { reel: 2, row: 0 }, { reel: 2, row: 2 },
      { reel: 3, row: 0 },
    ]);
    expect(wins[1]?.positions).toEqual([{ reel: 0, row: 2 }, { reel: 1, row: 1 }, { reel: 2, row: 1 }]);
  });

  it('pays five of a kind through Kickers on reels 2 and 4', () => {
    const grid = g('KE ST CO', 'BO KI WR', 'KE GT HE', 'DE PE KI', 'BA KE DO');
    expect(summary(evaluateWays(CFG, grid, []))).toEqual([
      { symbol: 'kerb', length: 5, ways: 1, payPerWay: 50, coins: 50 },
    ]);
  });

  it('treats landed wild reels as matching every row', () => {
    const grid = g('GR BO CO', 'WR GR ST', 'HE DE GR', 'PE BA DO', 'KE ZI GT');
    expect(summary(evaluateWays(CFG, grid, [1, 2]))).toEqual([
      { symbol: 'gramps', length: 3, ways: 9, payPerWay: 10, coins: 90 },
      { symbol: 'bolt', length: 3, ways: 9, payPerWay: 1, coins: 9 },
      { symbol: 'cone', length: 3, ways: 9, payPerWay: 1, coins: 9 },
    ]);
    const three = evaluateWays(CFG, grid, [3, 1, 2]);
    expect(summary(three)).toEqual([
      { symbol: 'gramps', length: 4, ways: 27, payPerWay: 25, coins: 675 },
      { symbol: 'bolt', length: 4, ways: 27, payPerWay: 3, coins: 81 },
      { symbol: 'cone', length: 4, ways: 27, payPerWay: 2, coins: 54 },
    ]);
    expect(three[0]?.positions).toHaveLength(1 + 3 + 3 + 3);
    // Repeating a wild reel changes nothing.
    expect(evaluateWays(CFG, grid, [1, 2, 1])).toEqual(evaluateWays(CFG, grid, [1, 2]));
  });

  it('never pays the Flyer, and the Kicker does not stand in for it', () => {
    const grid = g('FL GR BO', 'FL KI WR', 'FL HE DE', 'PE BA DO', 'KE ZI GT');
    expect(evaluateWays(CFG, grid, [])).toEqual([]);
    expect(evaluateWays(CFG, grid, [1, 2]).map((w) => w.symbol)).toEqual(['gramps', 'bolt']);
  });

  // The configuration rules keep the Kicker off reel 1 and landings never turn it wild, so a
  // wild-only win cannot happen in a valid game. The evaluator still refuses to pay one, and
  // counts a reel-1 wild as a way only beside a real symbol.
  it('pays no wild-only win, and a reel-1 wild only beside a real symbol', () => {
    expect(evaluateWays(CFG, g('KI KI KI', 'KI KI KI', 'KI KI KI', 'KI KI KI', 'KI KI KI'), [])).toEqual([]);
    expect(evaluateWays(CFG, g('GR BO CO', 'WR GR ST', 'HE DE GR', 'PE BA DO', 'KE ZI GT'), [0, 1, 2, 3, 4])).toEqual([]);
    const grid = g('GR KI CO', 'GR WR ST', 'GR HE DE', 'PE BA DO', 'KE ZI GT');
    const wins = evaluateWays(CFG, grid, []);
    expect(summary(wins)).toEqual([{ symbol: 'gramps', length: 3, ways: 2, payPerWay: 10, coins: 20 }]);
    expect(wins[0]?.positions.slice(0, 2)).toEqual([{ reel: 0, row: 0 }, { reel: 0, row: 1 }]);
  });

  it('refuses a grid of the wrong shape, an unknown symbol or a wild reel off the grid', () => {
    const ok = g('GR BO CO', 'WR GR ST', 'HE DE GR', 'PE BA DO', 'KE ZI GT');
    expect(() => evaluateWays(CFG, ok.slice(0, 4), [])).toThrow(RangeError);
    expect(() => evaluateWays(CFG, [...ok.slice(0, 4), ['gramps', 'bolt']], [])).toThrow(RangeError);
    expect(() => evaluateWays(CFG, [...ok.slice(0, 4), ['gramps', 'bolt', 'nope']], [])).toThrow(RangeError);
    expect(() => evaluateWays(CFG, ok, [5])).toThrow(RangeError);
    expect(() => evaluateWays(CFG, ok, [1.5])).toThrow(RangeError);
  });

  it('returns plain data that survives a JSON round trip', () => {
    const wins = evaluateWays(CFG, g('GR GR BO', 'GR KI ST', 'GR BO GR', 'GR CO WR', 'DE HE PE'), []);
    expect(JSON.parse(JSON.stringify(wins))).toEqual(wins);
  });
});

describe('countFlyers', () => {
  it('counts Flyers anywhere, reel by reel', () => {
    const grid = g('FL GR BO', 'WR KI ST', 'HE DE FL', 'PE FL DO', 'KE ZI GT');
    expect(countFlyers(CFG, grid)).toEqual({
      count: 3,
      positions: [{ reel: 0, row: 0 }, { reel: 2, row: 2 }, { reel: 3, row: 1 }],
    });
    expect(countFlyers(CFG, g('GR BO CO', 'WR GR ST', 'HE DE GR', 'PE BA DO', 'KE ZI GT'))).toEqual({
      count: 0,
      positions: [],
    });
  });
});

/** Seeded random grids: from the base strips, or any symbol anywhere to stress the rules. */
function randomGrid(rng: Rng, anySymbol: boolean): Grid {
  if (!anySymbol) return gridFromStops(CFG.reels, drawStops(rng, CFG.reels), CFG.grid.rows);
  const ids = CFG.symbols.map((s) => s.id);
  return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => ids[rng.nextInt(ids.length)] as string));
}

function randomWildReels(rng: Rng, anyReel: boolean): number[] {
  const candidates = anyReel ? [0, 1, 2, 3, 4] : [1, 2, 3];
  return candidates.filter(() => rng.nextInt(4) === 0);
}

describe('evaluateWays: properties over seeded random grids', () => {
  const wild = 'kicker';
  for (const anySymbol of [false, true]) {
    it(`holds on ${anySymbol ? 'arbitrary grids' : 'grids from the base strips'}`, () => {
      const rng = createRng(parseSeed(anySymbol ? '00000000feedface' : '00000000c0ffee00'));
      for (let i = 0; i < 3000; i++) {
        const grid = randomGrid(rng, anySymbol);
        const wildReels = randomWildReels(rng, anySymbol);
        const wins = evaluateWays(CFG, grid, wildReels);
        const matches = (reel: number, row: number, symbol: string) => {
          const id = grid[reel]?.[row];
          if (reel === 0) return !wildReels.includes(0) && (id === symbol || id === wild);
          return wildReels.includes(reel) || id === symbol || id === wild;
        };
        for (const win of wins) {
          // Never pays a symbol on a reel it does not reach.
          for (const p of win.positions) expect(p.reel).toBeLessThan(win.length);
          if (win.length < 5) {
            expect([0, 1, 2].some((row) => matches(win.length, row, win.symbol))).toBe(false);
          }
          // Every listed position matches, and every matching position on its reels is listed.
          for (let reel = 0; reel < win.length; reel++) {
            const rows = [0, 1, 2].filter((row) => matches(reel, row, win.symbol));
            expect(win.positions.filter((p) => p.reel === reel).map((p) => p.row)).toEqual(rows);
          }
          // A win starts from a real symbol on reel 1.
          expect(grid[0]).toContain(win.symbol);
          // Ways are the product of positions per reel; coins are pay × ways, in integers.
          const perReel = Array.from({ length: win.length }, (_, r) => win.positions.filter((p) => p.reel === r).length);
          expect(win.ways).toBe(perReel.reduce((a, b) => a * b, 1));
          expect(win.payPerWay).toBe(CFG.paytable[win.symbol]?.[win.length]);
          expect(win.coins).toBe(win.payPerWay * win.ways);
          expect(Number.isInteger(win.coins)).toBe(true);
        }
        expect(new Set(wins.map((w) => w.symbol)).size).toBe(wins.length);
        expect(profileTotal(CFG, grid, wildReels)).toBe(total(wins));
        if (i % 10 === 0) expectMatchesBruteForce(CFG, grid, wildReels);
      }
    });
  }

  it('is deterministic and leaves its inputs alone', () => {
    const grid = g('GR GR BO', 'GR KI ST', 'GR BO GR', 'GR CO WR', 'DE HE PE');
    const copy = JSON.parse(JSON.stringify(grid)) as Grid;
    const wildReels = [2];
    const first = evaluateWays(CFG, grid, wildReels);
    evaluateWays(CFG, g('KE ST CO', 'BO KI WR', 'KE GT HE', 'DE PE KI', 'BA KE DO'), [1, 3]);
    expect(evaluateWays(CFG, grid, wildReels)).toEqual(first);
    expect(grid).toEqual(copy);
    expect(wildReels).toEqual([2]);
  });
});

describe('exact check on a toy configuration', () => {
  // Three paying symbols, a wild on reels 2–4 and a scatter, on short strips. Not a valid
  // game (the validator wants the full symbol set); the evaluator only reads what it needs.
  const TOY: GameConfig = {
    ...CFG,
    id: 'toy-ways',
    symbols: [
      { id: 'a', kind: 'rider' },
      { id: 'b', kind: 'gear' },
      { id: 'c', kind: 'low' },
      { id: 'w', kind: 'wild' },
      { id: 'f', kind: 'scatter' },
    ],
    paytable: { a: { 3: 5, 4: 10, 5: 20 }, b: { 3: 2, 4: 4, 5: 8 }, c: { 3: 1, 4: 2, 5: 3 } },
    reels: [
      ['a', 'b', 'a', 'b'],
      ['a', 'w', 'c', 'b', 'f'],
      ['b', 'a', 'w', 'c'],
      ['c', 'a', 'f', 'w', 'b'],
      ['a', 'c', 'b', 'c'],
    ],
  };
  const lengths = TOY.reels.map((s) => s.length);
  const combos = lengths.reduce((a, b) => a * b, 1);

  function stopsOf(index: number): number[] {
    let rest = index;
    return lengths.map((len) => {
      const stop = rest % len;
      rest = Math.floor(rest / len);
      return stop;
    });
  }

  it('finds the distinct windows of a strip with their multiplicities', () => {
    expect(distinctWindows(['a', 'b', 'a', 'b'], 3)).toEqual([
      { symbols: ['a', 'b', 'a'], stops: 2, firstStop: 0 },
      { symbols: ['b', 'a', 'b'], stops: 2, firstStop: 1 },
    ]);
    for (const strip of TOY.reels) {
      expect(distinctWindows(strip, 3).reduce((n, w) => n + w.stops, 0)).toBe(strip.length);
    }
  });

  for (const wildReels of [[], [1], [2, 3]]) {
    it(`agrees with brute force on every stop combination, wild reels [${wildReels.join(', ')}]`, () => {
      let stopTotal = 0;
      for (let i = 0; i < combos; i++) {
        const grid = gridFromStops(TOY.reels, stopsOf(i), 3);
        const wins = evaluateWays(TOY, grid, wildReels);
        const brute = bruteForce(TOY, grid, wildReels);
        expect(wins.map((w) => [w.symbol, w.length, w.ways])).toEqual(
          [...brute.entries()].map(([symbol, { length, ways }]) => [symbol, length, ways]),
        );
        const coins = [...brute.entries()].reduce(
          (sum, [symbol, { length, ways }]) => sum + (TOY.paytable[symbol]?.[length as 3 | 4 | 5] as number) * ways,
          0,
        );
        expect(total(wins)).toBe(coins);
        stopTotal += coins;
      }
      expect(stopTotal).toBeGreaterThan(0);

      // The analyser's form: distinct windows per reel, profiled once, weighted by stop counts.
      const table = waysTable(TOY);
      const perReel = TOY.reels.map((strip, reel) =>
        distinctWindows(strip, 3).map((w) => ({
          stops: w.stops,
          profile: wildReels.includes(reel) ? wildReelProfile(table, reel === 0) : profileWindow(table, w.symbols, reel === 0),
        })),
      );
      let windowTotal = 0;
      let weight = 0;
      const profiles: Uint8Array[] = [];
      const walk = (reel: number, multiplicity: number): void => {
        if (reel === perReel.length) {
          windowTotal += multiplicity * waysCoins(table, profiles);
          weight += multiplicity;
          return;
        }
        for (const w of perReel[reel] ?? []) {
          profiles[reel] = w.profile;
          walk(reel + 1, multiplicity * w.stops);
        }
      };
      walk(0, 1);
      expect(weight).toBe(combos);
      expect(windowTotal).toBe(stopTotal);
    });
  }

  it('counts every scatter on every stop combination', () => {
    for (let i = 0; i < combos; i++) {
      const grid = gridFromStops(TOY.reels, stopsOf(i), 3);
      expect(countFlyers(TOY, grid).count).toBe(grid.flat().filter((id) => id === 'f').length);
    }
  });
});
