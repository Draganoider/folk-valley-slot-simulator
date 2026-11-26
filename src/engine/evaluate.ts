import type { GameConfig, ReelStrip, SymbolId } from './config';
import type { FlyerCount, Grid, Position, WaysWin } from './result';

/**
 * Base-game win evaluation: 243 ways, left to right (DR-005).
 *
 * The rules. A win needs the symbol or the Kicker on reels 1, 2 and 3 at least, in any row,
 * and extends over each further adjacent reel that has one. Ways are the product of matching
 * positions per reel, wilds included, and the win is pay × ways coins (DR-011). Only the
 * longest run per symbol pays, and different symbols' wins add. The Kicker substitutes for
 * every symbol except the Flyer and pays nothing by itself, so a win always starts from a
 * real symbol on reel 1; wild positions on reel 1 count as ways only beside one. The Flyer
 * pays nothing and is counted anywhere by `countFlyers`.
 *
 * Two forms of the same rules:
 *
 * - `evaluateWays(config, grid, wildReels)` returns the `WaysWin` records the spin result
 *   holds, positions included. This is what `spin` calls.
 * - The profile form, for the analyser and other hot loops. `waysTable(config)` compiles the
 *   configuration once; `profileWindow` reduces one reel's window to a count per paying
 *   symbol; `waysCoins` turns one profile per reel into the total coins without allocating.
 *   A reel's profile depends only on its window, so the analyser profiles each reel's
 *   `distinctWindows` once and enumerates their combinations, weighting each by the product
 *   of the windows' stop counts. `evaluateWays` is built on the same functions, and the
 *   tests check the two forms agree.
 *
 * Everything here is pure and deterministic: no draws, and no state between calls beyond the
 * cached table and its scratch buffers, which never change a result.
 */

/** A configuration compiled for evaluation. Build it with `waysTable`, which caches it. */
export interface WaysTable {
  readonly reels: number;
  readonly rows: number;
  /** The paying symbols (rider, gear and low), in configuration order. Profile index = position here. */
  readonly paying: readonly SymbolId[];
  /** The Kicker's id, or null in a toy configuration without one. */
  readonly wild: SymbolId | null;
  /** The Session Flyer's id, or null in a toy configuration without one. */
  readonly scatter: SymbolId | null;
  /** Coins per way: `pays[3 * s + (length − 3)]` for paying symbol `s`. */
  readonly pays: Int32Array;
  /** Every symbol's code: its paying index, {@link WILD_CODE} or {@link SCATTER_CODE}. */
  readonly codes: ReadonlyMap<SymbolId, number>;
  /** Reused by `evaluateWays`; never part of a result. */
  readonly scratch: readonly Uint8Array[];
}

export const WILD_CODE = -1;
export const SCATTER_CODE = -2;

const tables = new WeakMap<GameConfig, WaysTable>();

/** The compiled table for `config`, built once per configuration object. */
export function waysTable(config: GameConfig): WaysTable {
  let table = tables.get(config);
  if (table === undefined) {
    table = compileWaysTable(config);
    tables.set(config, table);
  }
  return table;
}

function compileWaysTable(config: GameConfig): WaysTable {
  const { reels, rows } = config.grid;
  if (reels < 3 || reels > 5) throw new RangeError(`Ways pay 3 to 5 of a kind, so 3 to 5 reels; got ${reels}.`);
  const paying: SymbolId[] = [];
  const codes = new Map<SymbolId, number>();
  let wild: SymbolId | null = null;
  let scatter: SymbolId | null = null;
  for (const sym of config.symbols) {
    if (codes.has(sym.id)) throw new RangeError(`Symbol "${sym.id}" is defined twice.`);
    if (sym.kind === 'wild') {
      if (wild !== null) throw new RangeError('A configuration has at most one wild.');
      wild = sym.id;
      codes.set(sym.id, WILD_CODE);
    } else if (sym.kind === 'scatter') {
      if (scatter !== null) throw new RangeError('A configuration has at most one scatter.');
      scatter = sym.id;
      codes.set(sym.id, SCATTER_CODE);
    } else {
      codes.set(sym.id, paying.length);
      paying.push(sym.id);
    }
  }
  const pays = new Int32Array(3 * paying.length);
  paying.forEach((id, s) => {
    const pay = config.paytable[id];
    if (pay === undefined) throw new RangeError(`Paying symbol "${id}" has no paytable entry.`);
    pays[3 * s] = pay[3];
    pays[3 * s + 1] = pay[4];
    pays[3 * s + 2] = pay[5];
  });
  const scratch = Array.from({ length: reels }, () => new Uint8Array(paying.length));
  return { reels, rows, paying, wild, scatter, pays, codes, scratch };
}

/**
 * Reduces one reel's window to its profile: for each paying symbol, how many positions show
 * it or a wild. On the first reel a symbol needs at least one real position, or its count is
 * 0, because a win starts from a real symbol. Writes into `out` when given (length
 * `table.paying.length`) and returns it.
 */
export function profileWindow(
  table: WaysTable,
  window: readonly SymbolId[],
  firstReel: boolean,
  out: Uint8Array = new Uint8Array(table.paying.length),
): Uint8Array {
  out.fill(0);
  let wilds = 0;
  for (const id of window) {
    const code = table.codes.get(id);
    if (code === undefined) throw new RangeError(`Unknown symbol "${id}" on the grid.`);
    if (code >= 0) out[code] = (out[code] as number) + 1;
    else if (code === WILD_CODE) wilds++;
  }
  if (wilds > 0) {
    for (let s = 0; s < out.length; s++) {
      const real = out[s] as number;
      if (!firstReel || real > 0) out[s] = real + wilds;
    }
  }
  return out;
}

/**
 * The profile of a reel turned fully wild by a landing: every row matches every symbol. On
 * the first reel nothing could start a win, so it is all zeros there.
 */
export function wildReelProfile(
  table: WaysTable,
  firstReel: boolean,
  out: Uint8Array = new Uint8Array(table.paying.length),
): Uint8Array {
  return out.fill(firstReel ? 0 : table.rows);
}

/**
 * Total coins of the ways wins for one profile per reel, reel 1 first: pay × ways summed
 * over symbols, before any multiplier. Allocates nothing.
 */
export function waysCoins(table: WaysTable, profiles: readonly Uint8Array[]): number {
  const { pays, reels } = table;
  const symbols = table.paying.length;
  let total = 0;
  for (let s = 0; s < symbols; s++) {
    let ways = 1;
    let length = 0;
    while (length < reels) {
      const count = (profiles[length] as Uint8Array)[s] as number;
      if (count === 0) break;
      ways *= count;
      length++;
    }
    if (length >= 3) total += (pays[3 * s + Math.min(length, 5) - 3] as number) * ways;
  }
  return total;
}

/** One distinct window of a reel strip and how many stops show it. */
export interface DistinctWindow {
  readonly symbols: readonly SymbolId[];
  /** Stops showing this window; the window's probability is stops ÷ strip length. */
  readonly stops: number;
  /** The first stop that shows it. */
  readonly firstStop: number;
}

/** Each distinct `rows`-high window of `strip`, in order of first stop, with its multiplicity. */
export function distinctWindows(strip: ReelStrip, rows: number): DistinctWindow[] {
  const byKey = new Map<string, { symbols: SymbolId[]; stops: number; firstStop: number }>();
  for (let stop = 0; stop < strip.length; stop++) {
    const symbols = Array.from({ length: rows }, (_, row) => strip[(stop + row) % strip.length] as SymbolId);
    const key = symbols.join('\u0000');
    const seen = byKey.get(key);
    if (seen === undefined) byKey.set(key, { symbols, stops: 1, firstStop: stop });
    else seen.stops++;
  }
  return [...byKey.values()];
}

/** Bit r set: reel r is fully wild. Refuses a reel that is not on the grid. */
function wildMaskOf(table: WaysTable, wildReels: readonly number[]): number {
  let mask = 0;
  for (const reel of wildReels) {
    if (!Number.isInteger(reel) || reel < 0 || reel >= table.reels) {
      throw new RangeError(`Wild reel ${reel} is not on the grid, which has ${table.reels} reels.`);
    }
    mask |= 1 << reel;
  }
  return mask;
}

function checkGrid(table: WaysTable, grid: Grid): void {
  if (grid.length !== table.reels) {
    throw new RangeError(`The grid needs ${table.reels} reels; got ${grid.length}.`);
  }
  for (let reel = 0; reel < grid.length; reel++) {
    const window = grid[reel] as readonly SymbolId[];
    if (window.length !== table.rows) {
      throw new RangeError(`Reel ${reel + 1} needs ${table.rows} rows; got ${window.length}.`);
    }
  }
}

/**
 * Every ways win on `grid`, with the reels in `wildReels` (0-based) treated as fully wild, in
 * configuration symbol order. Each win lists every position that takes part, wilds
 * included, reel by reel and top row first.
 */
export function evaluateWays(config: GameConfig, grid: Grid, wildReels: readonly number[]): WaysWin[] {
  const table = waysTable(config);
  checkGrid(table, grid);
  const mask = wildMaskOf(table, wildReels);
  const profiles = table.scratch;
  for (let reel = 0; reel < table.reels; reel++) {
    const out = profiles[reel] as Uint8Array;
    if (mask & (1 << reel)) wildReelProfile(table, reel === 0, out);
    else profileWindow(table, grid[reel] as readonly SymbolId[], reel === 0, out);
  }

  const wins: WaysWin[] = [];
  for (let s = 0; s < table.paying.length; s++) {
    let ways = 1;
    let length = 0;
    while (length < table.reels) {
      const count = (profiles[length] as Uint8Array)[s] as number;
      if (count === 0) break;
      ways *= count;
      length++;
    }
    if (length < 3) continue;
    const winLength = Math.min(length, 5) as 3 | 4 | 5;
    const symbol = table.paying[s] as SymbolId;
    const positions: Position[] = [];
    for (let reel = 0; reel < length; reel++) {
      const window = grid[reel] as readonly SymbolId[];
      const allWild = (mask & (1 << reel)) !== 0;
      for (let row = 0; row < table.rows; row++) {
        const id = window[row];
        if (allWild || id === symbol || id === table.wild) positions.push({ reel, row });
      }
    }
    const payPerWay = table.pays[3 * s + winLength - 3] as number;
    wins.push({ symbol, length: winLength, ways, payPerWay, coins: payPerWay * ways, positions });
  }
  return wins;
}

/** The Session Flyers visible on `grid`, anywhere, reel by reel and top row first. */
export function countFlyers(config: GameConfig, grid: Grid): FlyerCount {
  const table = waysTable(config);
  checkGrid(table, grid);
  const positions: Position[] = [];
  if (table.scatter !== null) {
    for (let reel = 0; reel < grid.length; reel++) {
      const window = grid[reel] as readonly SymbolId[];
      for (let row = 0; row < window.length; row++) {
        if (window[row] === table.scatter) positions.push({ reel, row });
      }
    }
  }
  return { count: positions.length, positions };
}
