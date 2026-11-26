import type { GameConfig, ReelStrip, SymbolId } from './config';
import type { Grid } from './result';
import { WILD_REELS } from './config';
import { distinctWindows, profileWindow, waysCoins, waysTable, wildReelProfile, type WaysTable } from './evaluate';

/**
 * The base game's exact outcome distribution (DR-006, math-targets 5.1), for the analyser.
 *
 * Every figure here is an integer count of equally likely outcomes, so nothing is rounded.
 * One paid spin's base stops are independent and uniform per reel, so the probability of a
 * combination of windows is the product of each window's stop count over the strip length.
 *
 * Two ways to enumerate, which must agree exactly:
 *
 * - **`reelSweep`, a dynamic programme over reels.** 243 ways factorise by symbol: a
 *   symbol's run is alive while every reel so far shows it (or a wild), its ways are the
 *   product of the counts, and it pays when the run ends at length 3 or more. So the state
 *   after reel r is the accumulated coins, each symbol's ways while alive, the Flyers so far
 *   and the leftmost Kicker reel; equal states merge, and most of them die early. This is
 *   what `analyse` uses, because it is fast enough to tune with.
 * - **`bruteForceBase`, every combination of distinct windows** through the evaluator's
 *   profile form (`waysCoins`), the method math-targets 5.1 describes. The nightly job runs it
 *   on the shipped configuration and the tests run it on toy ones, and both compare it with
 *   the sweep bin by bin.
 *
 * Both use `profileWindow`, `wildReelProfile` and the pays from `waysTable`, the same
 * functions `evaluateWays` is built on, so the rules live in one place.
 */

/** One outcome class of a sweep: its leftmost Kicker reel, Flyer count and coins, with its weight. */
export interface SweepCell {
  /** 0-based reel of the leftmost Kicker on the grid as stopped, or −1 for none. */
  readonly kicker: number;
  readonly flyers: number;
  /** Ways coins before any multiplier. */
  readonly coins: number;
  /** Combinations of stops that give this cell: an integer. */
  readonly weight: number;
}

export interface SweepResult {
  readonly cells: readonly SweepCell[];
  /** Product of the strip lengths: the number of equally likely stop combinations. */
  readonly total: number;
  /** States after each reel, for the speed record. */
  readonly statesPerReel: readonly number[];
}

interface WindowClass {
  readonly profile: Uint8Array;
  readonly hasWild: boolean;
  readonly flyers: number;
  readonly stops: number;
}

/** One reel's windows with their stop counts. */
type Windows = readonly { readonly symbols: readonly SymbolId[]; readonly stops: number }[];

/** A reel's windows reduced to what the evaluation needs, with equal ones merged. */
function windowClasses(table: WaysTable, windows: Windows, reel: number, wildReel: boolean): WindowClass[] {
  const byKey = new Map<string, { profile: Uint8Array; hasWild: boolean; flyers: number; stops: number }>();
  for (const w of windows) {
    const profile = wildReel ? wildReelProfile(table, reel === 0) : profileWindow(table, w.symbols, reel === 0);
    const hasWild = table.wild !== null && w.symbols.includes(table.wild);
    let flyers = 0;
    if (table.scatter !== null) for (const s of w.symbols) if (s === table.scatter) flyers++;
    const key = `${hasWild ? 1 : 0}|${flyers}|${profile.join(',')}`;
    const seen = byKey.get(key);
    if (seen === undefined) byKey.set(key, { profile, hasWild, flyers, stops: w.stops });
    else seen.stops += w.stops;
  }
  return [...byKey.values()];
}

function checkTotal(strips: readonly ReelStrip[]): number {
  let total = 1;
  for (const s of strips) total *= s.length;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`The strips have ${total} stop combinations, more than 2^53; the integer weights would round.`);
  }
  return total;
}

/**
 * The base game's ways coins by leftmost Kicker reel and Flyer count, with the reels in
 * `wildReels` (0-based) fully wild for evaluation. Their windows still count for the Kicker
 * and the Flyers, which are read from the grid as stopped, as `spin` reads them.
 *
 * @param track When false the Kicker and the Flyers are not tracked (a Session spin, where
 *   neither starts anything), so more states merge.
 */
export function reelSweep(
  config: GameConfig,
  strips: readonly ReelStrip[],
  wildReels: readonly number[] = [],
  track = true,
): SweepResult {
  const table = waysTable(config);
  checkTotal(strips);
  return sweepWindows(config, strips.map((strip) => distinctWindows(strip, table.rows)), wildReels, track);
}

/**
 * The analyser's evaluation of one grid, by the same sweep restricted to one window per reel:
 * the cell `reelSweep` counts that grid in. The engine-versus-analyser tests compare it with
 * what `spin` paid for the same stops.
 */
export function sweepCellOfGrid(
  config: GameConfig,
  grid: Grid,
  wildReels: readonly number[] = [],
  track = true,
): SweepCell {
  const result = sweepWindows(config, grid.map((symbols) => [{ symbols, stops: 1 }]), wildReels, track);
  if (result.cells.length !== 1) throw new Error('unreachable: one grid gives one cell');
  return result.cells[0] as SweepCell;
}

function sweepWindows(
  config: GameConfig,
  perReel: readonly Windows[],
  wildReels: readonly number[],
  track: boolean,
): SweepResult {
  const table = waysTable(config);
  if (perReel.length !== table.reels) throw new RangeError(`Need windows for ${table.reels} reels; got ${perReel.length}.`);
  let total = 1;
  for (const windows of perReel) total *= windows.reduce((a, w) => a + w.stops, 0);
  const S = table.paying.length;
  const reels = table.reels;
  const pays = table.pays;

  // State: coins, flyers, kicker, then each symbol's live ways (0 = dead).
  type State = { coins: number; flyers: number; kicker: number; alive: Int32Array; weight: number };
  let states = new Map<string, State>();
  const keyOf = (coins: number, flyers: number, kicker: number, alive: Int32Array): string =>
    `${coins}|${flyers}|${kicker}|${alive.join(',')}`;
  const start = { coins: 0, flyers: 0, kicker: -1, alive: new Int32Array(S).fill(1), weight: 1 };
  states.set('start', start);
  const statesPerReel: number[] = [];

  for (let reel = 0; reel < reels; reel++) {
    const classes = windowClasses(table, perReel[reel] as Windows, reel, wildReels.includes(reel));
    const next = new Map<string, State>();
    for (const st of states.values()) {
      for (const wc of classes) {
        const alive = new Int32Array(S);
        let coins = st.coins;
        for (let s = 0; s < S; s++) {
          const ways = st.alive[s] as number;
          if (ways === 0) continue;
          const c = wc.profile[s] as number;
          if (c > 0) alive[s] = ways * c;
          else if (reel >= 3) coins += (pays[3 * s + Math.min(reel, 5) - 3] as number) * ways;
        }
        const flyers = track ? st.flyers + wc.flyers : 0;
        const kicker = !track ? -1 : st.kicker >= 0 ? st.kicker : wc.hasWild ? reel : -1;
        const key = keyOf(coins, flyers, kicker, alive);
        const weight = st.weight * wc.stops;
        const seen = next.get(key);
        if (seen === undefined) next.set(key, { coins, flyers, kicker, alive, weight });
        else seen.weight += weight;
      }
    }
    states = next;
    statesPerReel.push(states.size);
  }

  const merged = new Map<string, SweepCell>();
  for (const st of states.values()) {
    let coins = st.coins;
    for (let s = 0; s < S; s++) {
      const ways = st.alive[s] as number;
      if (ways > 0 && reels >= 3) coins += (pays[3 * s + Math.min(reels, 5) - 3] as number) * ways;
    }
    const key = `${st.kicker}|${st.flyers}|${coins}`;
    const seen = merged.get(key);
    if (seen === undefined) merged.set(key, { kicker: st.kicker, flyers: st.flyers, coins, weight: st.weight });
    else merged.set(key, { ...seen, weight: seen.weight + st.weight });
  }
  return { cells: [...merged.values()], total, statesPerReel };
}

/**
 * The same cells as {@link reelSweep}, by walking every combination of distinct windows and
 * evaluating each with `waysCoins` (a reel turned wild merges its windows that differ only in
 * Kicker and Flyers). Slow on a full configuration: about a minute per 10⁹ combinations. The
 * nightly job runs it on the shipped configuration and the tests on small ones.
 */
export function bruteForceBase(
  config: GameConfig,
  strips: readonly ReelStrip[],
  wildReels: readonly number[] = [],
  track = true,
): SweepResult {
  const table = waysTable(config);
  const total = checkTotal(strips);
  const reels = table.reels;
  const perReel = strips.map((strip, reel) => {
    const windows = distinctWindows(strip, table.rows).map((w) => ({
      profile: wildReels.includes(reel) ? wildReelProfile(table, reel === 0) : profileWindow(table, w.symbols, reel === 0),
      hasWild: table.wild !== null && w.symbols.includes(table.wild),
      flyers: table.scatter === null ? 0 : w.symbols.filter((s) => s === table.scatter).length,
      stops: w.stops,
    }));
    if (!wildReels.includes(reel)) return windows;
    // A wild reel's windows differ only in their Kicker and Flyers, so equal ones are merged.
    const merged = new Map<string, (typeof windows)[number]>();
    for (const w of windows) {
      const key = `${w.hasWild}|${w.flyers}`;
      const seen = merged.get(key);
      merged.set(key, seen === undefined ? w : { ...seen, stops: seen.stops + w.stops });
    }
    return [...merged.values()];
  });
  const cells = new Map<string, { kicker: number; flyers: number; coins: number; weight: number }>();
  const profiles: Uint8Array[] = new Array(reels);
  const idx = new Array<number>(reels).fill(0);
  for (;;) {
    let weight = 1;
    let flyers = 0;
    let kicker = -1;
    for (let r = 0; r < reels; r++) {
      const w = (perReel[r] as (typeof perReel)[number])[idx[r] as number] as (typeof perReel)[number][number];
      profiles[r] = w.profile;
      weight *= w.stops;
      flyers += w.flyers;
      if (kicker < 0 && w.hasWild) kicker = r;
    }
    if (!track) {
      flyers = 0;
      kicker = -1;
    }
    const coins = waysCoins(table, profiles);
    const key = `${kicker}|${flyers}|${coins}`;
    const seen = cells.get(key);
    if (seen === undefined) cells.set(key, { kicker, flyers, coins, weight });
    else seen.weight += weight;
    let r = reels - 1;
    while (r >= 0) {
      idx[r] = (idx[r] as number) + 1;
      if ((idx[r] as number) < (perReel[r] as unknown[]).length) break;
      idx[r] = 0;
      r--;
    }
    if (r < 0) break;
  }
  return { cells: [...cells.values()], total, statesPerReel: [] };
}

/** The same cells in a canonical order, for comparing two sweeps. */
export function sortedCells(result: SweepResult): SweepCell[] {
  return [...result.cells].sort((a, b) => a.kicker - b.kicker || a.flyers - b.flyers || a.coins - b.coins);
}

/** Every non-empty set of wild-eligible reels a landing can turn wild, as sorted 0-based reels. */
export function landingWildSets(): number[][] {
  const sets: number[][] = [];
  const n = WILD_REELS.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    sets.push(WILD_REELS.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return sets;
}
