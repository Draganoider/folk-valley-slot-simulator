import type { InjuryLevel, TrickTierId } from './config';
import { INJURY_LEVELS, TRICK_TIER_IDS } from './config';
import type { Theoretical } from './analyser';
import type { SessionResult, SpinResult } from './result';

/**
 * Streaming statistics over spin results: what a simulation run or a player's session
 * observed (AGENTS.md rule 6, docs/research/math-targets.md section 7).
 *
 * Two layers:
 *
 * - {@link SimulationStats}, the accumulator. Plain data holding only integer counts and
 *   sums, so it passes through `postMessage` and JSON unchanged, and {@link mergeStats}
 *   combines the partial results of several workers **exactly**: the merged accumulator
 *   equals, field for field, the one a single thread builds over the same spins. Sums of
 *   squares can pass 2^53, so they are kept as a {@link WideInt}.
 * - {@link SimulationSummary}, the figures derived from it by {@link summarise}. Every
 *   figure is an {@link ObservedFigure}: labelled observed, with a `theoretical` slot that
 *   only {@link withTheoretical} fills, and only from the analyser's labelled values. Nothing
 *   here computes a theoretical value from simulation.
 *
 * Amounts are integer coins, as everywhere in the engine. "× bet" means divided by the cost
 * of one paid spin in coins.
 */
export const STATS_FORMAT_VERSION = 1 as const;

// ------------------------------------------------------------------ wide integers

const TWO_POW_32 = 0x1_0000_0000;

/** A non-negative integer of up to about 2^85: hi · 2^32 + lo, with 0 ≤ lo < 2^32. */
export interface WideInt {
  readonly hi: number;
  readonly lo: number;
}

const WIDE_ZERO: WideInt = { hi: 0, lo: 0 };

function wideAdd(a: WideInt, b: WideInt): WideInt {
  const lo = a.lo + b.lo;
  const carry = Math.floor(lo / TWO_POW_32);
  const hi = a.hi + b.hi + carry;
  if (!Number.isSafeInteger(hi)) throw new RangeError('A wide sum overflowed.');
  return { hi, lo: lo - carry * TWO_POW_32 };
}

function wideFromSafe(x: number): WideInt {
  const hi = Math.floor(x / TWO_POW_32);
  return { hi, lo: x - hi * TWO_POW_32 };
}

/** The exact value, for reporting. */
export function wideToBigInt(x: WideInt): bigint {
  return BigInt(x.hi) * BigInt(TWO_POW_32) + BigInt(x.lo);
}

// ------------------------------------------------------------------- histogram

/**
 * Upper edges of the win histogram, in × bet. Bucket 0 is a win of exactly 0; bucket 1 is
 * above 0 and below 1× (losses disguised as wins); bucket k ≥ 2 runs from edge k − 2
 * (inclusive) to edge k − 1 (exclusive); the last bucket is 2,500× and up, the cap.
 */
export const WIN_HISTOGRAM_EDGES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2500] as const;

/** A readable label for each bucket of the histogram, in bucket order. */
export const WIN_HISTOGRAM_LABELS: readonly string[] = [
  '0',
  '(0, 1)',
  ...WIN_HISTOGRAM_EDGES.slice(1).map((edge, i) => `[${WIN_HISTOGRAM_EDGES[i]}, ${edge})`),
  `${WIN_HISTOGRAM_EDGES[WIN_HISTOGRAM_EDGES.length - 1]}+`,
];

function histogramBucket(winCoins: number, costCoins: number): number {
  if (winCoins === 0) return 0;
  for (let k = 0; k < WIN_HISTOGRAM_EDGES.length; k++) {
    // Integers on both sides, so the edge is exact.
    if (winCoins < (WIN_HISTOGRAM_EDGES[k] as number) * costCoins) return k + 1;
  }
  return WIN_HISTOGRAM_EDGES.length + 1;
}

// ----------------------------------------------------------------- accumulator

export interface OutcomeCounts {
  readonly attempts: number;
  readonly landed: number;
  readonly bailed: number;
}

/** Counts keyed by a value written as a decimal string, such as a Session length. */
export interface CountMap {
  readonly [key: string]: number;
}

/** Spins without a payout, kept so that runs merged in order still find the longest. */
export interface DroughtTracker {
  /** Spins before the first payout; every spin when none paid. */
  readonly leading: number;
  /** Spins after the last payout; every spin when none paid. */
  readonly trailing: number;
  /** The longest run without a payout, wherever it lies. */
  readonly longest: number;
}

export interface MaxWin {
  readonly coins: number;
  /** The paid spin that paid it; with the seed, the config and the card before, it replays. */
  readonly spinIndex: number;
}

/** Every figure is observed. Plain data, integers only. Build with {@link emptyStats}. */
export interface SimulationStats {
  readonly formatVersion: typeof STATS_FORMAT_VERSION;
  /** Null until the first spin is added; every spin added must agree with them after that. */
  readonly configId: string | null;
  readonly masterSeed: string | null;
  readonly costCoins: number | null;
  readonly spins: number;
  /** Lowest and highest spin index added; merges must not overlap. */
  readonly firstSpinIndex: number | null;
  readonly lastSpinIndex: number | null;

  readonly totalBetCoins: number;
  readonly totalWinCoins: number;
  readonly sumSquaredWinCoins: WideInt;

  /** Paid spins that paid anything. */
  readonly hits: number;
  /** Paid more than they cost. */
  readonly winsAboveBet: number;
  /** Paid exactly what they cost. */
  readonly evenMoney: number;
  /** Paid something, but less than they cost: a celebration while losing. */
  readonly lossesDisguisedAsWins: number;
  /** Reached the max-win cap. */
  readonly capped: number;
  readonly maxWin: MaxWin | null;
  readonly drought: DroughtTracker;
  /** Counts per bucket of {@link WIN_HISTOGRAM_EDGES}. */
  readonly winHistogram: readonly number[];

  readonly base: {
    /** Base-game ways wins, multiplier included, on every paid spin. */
    readonly winCoins: number;
    /** The part of `winCoins` paid on spins whose trick attempt landed. */
    readonly winCoinsOnLanding: number;
  };
  /** Base-game trick attempts. */
  readonly tricks: OutcomeCounts & { readonly byTier: { readonly [T in TrickTierId]: OutcomeCounts } };
  readonly scarCard: {
    /** Marks added by base-game bails. */
    readonly marksAdded: number;
    readonly fills: number;
  };
  readonly sessions: {
    readonly triggers: {
      readonly flyers3: number;
      readonly flyers4: number;
      readonly flyers5: number;
      readonly scarCard: number;
    };
    /** Free spins played across every Session. */
    readonly spins: number;
    readonly winCoins: number;
    readonly winCoinsFromFlyers: number;
    readonly winCoinsFromScarCard: number;
    /** Attempts on the ladder, one per free spin. */
    readonly attempts: OutcomeCounts;
    readonly endReasons: { readonly 'spins-out': number; readonly 'pain-limit': number; readonly 'max-win': number };
    /** Sessions by number of free spins played. */
    readonly lengths: CountMap;
    /** Sessions by the ladder multiplier after their last spin. */
    readonly finalMultipliers: CountMap;
    /** Sessions by the rung reached after their last spin. */
    readonly finalRungs: CountMap;
  };
  /** Injury cards shown: every bail's injury, base and Session, and each Session's closing card. */
  readonly injuries: { readonly [L in InjuryLevel]: number };
}

function emptyOutcomes(): OutcomeCounts {
  return { attempts: 0, landed: 0, bailed: 0 };
}

function tierRecord<T>(make: () => T): { [K in TrickTierId]: T } {
  const out = {} as { [K in TrickTierId]: T };
  for (const tier of TRICK_TIER_IDS) out[tier] = make();
  return out;
}

function injuryRecord(): { [L in InjuryLevel]: number } {
  const out = {} as { [L in InjuryLevel]: number };
  for (const level of INJURY_LEVELS) out[level] = 0;
  return out;
}

/** The accumulator of no spins. */
export function emptyStats(): SimulationStats {
  return {
    formatVersion: STATS_FORMAT_VERSION,
    configId: null,
    masterSeed: null,
    costCoins: null,
    spins: 0,
    firstSpinIndex: null,
    lastSpinIndex: null,
    totalBetCoins: 0,
    totalWinCoins: 0,
    sumSquaredWinCoins: WIDE_ZERO,
    hits: 0,
    winsAboveBet: 0,
    evenMoney: 0,
    lossesDisguisedAsWins: 0,
    capped: 0,
    maxWin: null,
    drought: { leading: 0, trailing: 0, longest: 0 },
    winHistogram: new Array<number>(WIN_HISTOGRAM_EDGES.length + 2).fill(0),
    base: { winCoins: 0, winCoinsOnLanding: 0 },
    tricks: { ...emptyOutcomes(), byTier: tierRecord(emptyOutcomes) },
    scarCard: { marksAdded: 0, fills: 0 },
    sessions: {
      triggers: { flyers3: 0, flyers4: 0, flyers5: 0, scarCard: 0 },
      spins: 0,
      winCoins: 0,
      winCoinsFromFlyers: 0,
      winCoinsFromScarCard: 0,
      attempts: emptyOutcomes(),
      endReasons: { 'spins-out': 0, 'pain-limit': 0, 'max-win': 0 },
      lengths: {},
      finalMultipliers: {},
      finalRungs: {},
    },
    injuries: injuryRecord(),
  };
}

// The mutable twin of SimulationStats, used only inside the accumulator.
type Mutable<T> = T extends readonly (infer U)[]
  ? U[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
type MutableStats = Mutable<SimulationStats>;

function clone(stats: SimulationStats): MutableStats {
  return structuredCloneLike(stats) as MutableStats;
}

// JSON-safe deep copy; the accumulator is plain data by design.
function structuredCloneLike<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function checkSafe(x: number, what: string): void {
  if (!Number.isSafeInteger(x)) throw new RangeError(`${what} is no longer a safe integer.`);
}

function bump(map: { [key: string]: number }, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by;
}

function addOutcome(target: Mutable<OutcomeCounts>, outcome: 'landed' | 'bailed'): void {
  target.attempts += 1;
  target[outcome] += 1;
}

function addSession(s: MutableStats, session: SessionResult): void {
  const out = s.sessions;
  if (session.trigger.kind === 'scar-card') {
    out.triggers.scarCard += 1;
    out.winCoinsFromScarCard += session.totalWinCoins;
  } else {
    out.triggers[`flyers${session.trigger.count}`] += 1;
    out.winCoinsFromFlyers += session.totalWinCoins;
  }
  out.spins += session.spins.length;
  out.winCoins += session.totalWinCoins;
  out.endReasons[session.endReason] += 1;
  bump(out.lengths, String(session.spins.length));
  const last = session.spins[session.spins.length - 1];
  bump(out.finalMultipliers, last === undefined ? 'none' : String(last.ladderAfter.multiplier));
  bump(out.finalRungs, last === undefined ? String(session.startRung) : String(last.ladderAfter.rung));
  for (const spin of session.spins) {
    addOutcome(out.attempts, spin.attempt.outcome);
    if (spin.attempt.bail !== null) s.injuries[spin.attempt.bail.injury.level] += 1;
  }
  s.injuries[session.closing.level] += 1;
}

/**
 * Adds one paid spin. Returns a new accumulator; the input is not changed. For a hot loop,
 * {@link StatsAccumulator} avoids the copy.
 */
export function addSpin(stats: SimulationStats, result: SpinResult): SimulationStats {
  const acc = new StatsAccumulator(stats);
  acc.add(result);
  return acc.snapshot();
}

/** A mutable accumulator for hot loops. `snapshot()` returns the plain-data copy. */
export class StatsAccumulator {
  private readonly s: MutableStats;

  constructor(start: SimulationStats = emptyStats()) {
    this.s = clone(start);
  }

  add(result: SpinResult): void {
    const s = this.s;
    if (s.configId === null) {
      s.configId = result.configId;
      s.masterSeed = result.masterSeed;
      s.costCoins = result.costCoins;
    } else if (
      s.configId !== result.configId ||
      s.masterSeed !== result.masterSeed ||
      s.costCoins !== result.costCoins
    ) {
      throw new Error(
        `Spin ${result.spinIndex} has config ${result.configId}, seed ${result.masterSeed} and cost ` +
          `${result.costCoins}; these stats hold ${s.configId}, ${s.masterSeed} and ${s.costCoins}.`,
      );
    }
    if (s.lastSpinIndex !== null && result.spinIndex <= s.lastSpinIndex) {
      throw new Error(`Spin ${result.spinIndex} is not after spin ${s.lastSpinIndex}; add spins in order.`);
    }
    if (s.firstSpinIndex === null) s.firstSpinIndex = result.spinIndex;
    s.lastSpinIndex = result.spinIndex;

    const win = result.totalWinCoins;
    const cost = result.costCoins;
    if (!Number.isSafeInteger(win) || win < 0) throw new RangeError(`Spin ${result.spinIndex} paid ${win} coins.`);

    s.spins += 1;
    s.totalBetCoins += cost;
    s.totalWinCoins += win;
    checkSafe(s.totalWinCoins, 'The total win');
    checkSafe(s.totalBetCoins, 'The total bet');
    s.sumSquaredWinCoins = wideAdd(s.sumSquaredWinCoins, squareWide(win));

    if (win > 0) {
      s.hits += 1;
      if (win > cost) s.winsAboveBet += 1;
      else if (win === cost) s.evenMoney += 1;
      else s.lossesDisguisedAsWins += 1;
    }
    if (result.capped) s.capped += 1;
    if (s.maxWin === null || win > s.maxWin.coins) s.maxWin = { coins: win, spinIndex: result.spinIndex };
    s.drought = appendDrought(s.drought, s.spins - 1, win === 0);
    s.winHistogram[histogramBucket(win, cost)]! += 1;

    const base = result.base;
    s.base.winCoins += base.winCoins;
    const attempt = base.attempt;
    if (attempt !== null) {
      addOutcome(s.tricks, attempt.outcome);
      addOutcome(s.tricks.byTier[attempt.tier], attempt.outcome);
      if (attempt.outcome === 'landed') s.base.winCoinsOnLanding += base.winCoins;
      if (attempt.bail !== null) s.injuries[attempt.bail.injury.level] += 1;
    }
    if (result.scarCard.after !== result.scarCard.before || result.scarCard.filled) s.scarCard.marksAdded += 1;
    if (result.scarCard.filled) s.scarCard.fills += 1;
    if (result.session !== null) addSession(s, result.session);
  }

  /** A plain-data copy in canonical form (see {@link normalise}). */
  snapshot(): SimulationStats {
    return normalise(structuredCloneLike(this.s) as SimulationStats);
  }
}

/** w² as a wide integer, exact for any safe w. */
function squareWide(w: number): WideInt {
  if (w < 0x400_0000) return wideFromSafe(w * w); // w < 2^26, so w² < 2^52: exact
  // Far above any real win (the cap is 2,500 × the cost); exact by BigInt.
  const sq = BigInt(w) * BigInt(w);
  const hi = Number(sq / BigInt(TWO_POW_32));
  if (!Number.isSafeInteger(hi)) throw new RangeError('A win is too large to square exactly.');
  return { hi, lo: Number(sq % BigInt(TWO_POW_32)) };
}

/** The drought after appending one spin to a tracker over `before` spins. */
function appendDrought(d: DroughtTracker, before: number, dry: boolean): DroughtTracker {
  const allDry = d.leading === before;
  if (dry) {
    const trailing = d.trailing + 1;
    return { leading: allDry ? before + 1 : d.leading, trailing, longest: Math.max(d.longest, trailing) };
  }
  return { leading: d.leading, trailing: 0, longest: d.longest };
}

function mergeDrought(a: DroughtTracker, aSpins: number, b: DroughtTracker, bSpins: number): DroughtTracker {
  const aAllDry = a.leading === aSpins;
  const bAllDry = b.leading === bSpins;
  return {
    leading: aAllDry ? aSpins + b.leading : a.leading,
    trailing: bAllDry ? a.trailing + bSpins : b.trailing,
    longest: Math.max(a.longest, b.longest, a.trailing + b.leading),
  };
}

function addCounts(a: CountMap, b: CountMap): CountMap {
  const out: { [key: string]: number } = {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareKeys);
  for (const key of keys) out[key] = (a[key] ?? 0) + (b[key] ?? 0);
  return out;
}

function compareKeys(x: string, y: string): number {
  const nx = Number(x);
  const ny = Number(y);
  if (Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
  return x < y ? -1 : x > y ? 1 : 0;
}

function addOutcomes(a: OutcomeCounts, b: OutcomeCounts): OutcomeCounts {
  return { attempts: a.attempts + b.attempts, landed: a.landed + b.landed, bailed: a.bailed + b.bailed };
}

function sortCounts(map: CountMap): CountMap {
  return addCounts(map, {});
}

/**
 * Combines two accumulators, `a`'s spins all before `b`'s. Exact: the result equals the
 * accumulator one thread would build adding a's spins and then b's. Refuses accumulators of
 * different configs, seeds or costs, and spin ranges that overlap or are out of order.
 */
export function mergeStats(a: SimulationStats, b: SimulationStats): SimulationStats {
  if (b.spins === 0) return normalise(a);
  if (a.spins === 0) return normalise(b);
  if (a.configId !== b.configId || a.masterSeed !== b.masterSeed || a.costCoins !== b.costCoins) {
    throw new Error(
      `Cannot merge stats of ${a.configId}/${a.masterSeed}/${a.costCoins} with ${b.configId}/${b.masterSeed}/${b.costCoins}.`,
    );
  }
  if ((a.lastSpinIndex as number) >= (b.firstSpinIndex as number)) {
    throw new Error(
      `Cannot merge spins ${a.firstSpinIndex}–${a.lastSpinIndex} before ${b.firstSpinIndex}–${b.lastSpinIndex}: ` +
        'merge in spin order, without overlap.',
    );
  }
  const sum = (x: number, y: number, what: string): number => {
    const z = x + y;
    checkSafe(z, what);
    return z;
  };
  const tiers = tierRecord(emptyOutcomes);
  for (const tier of TRICK_TIER_IDS) tiers[tier] = addOutcomes(a.tricks.byTier[tier], b.tricks.byTier[tier]);
  const injuries = injuryRecord();
  for (const level of INJURY_LEVELS) injuries[level] = a.injuries[level] + b.injuries[level];
  const maxWin = (b.maxWin as MaxWin).coins > (a.maxWin as MaxWin).coins ? b.maxWin : a.maxWin;

  return {
    formatVersion: STATS_FORMAT_VERSION,
    configId: a.configId,
    masterSeed: a.masterSeed,
    costCoins: a.costCoins,
    spins: a.spins + b.spins,
    firstSpinIndex: a.firstSpinIndex,
    lastSpinIndex: b.lastSpinIndex,
    totalBetCoins: sum(a.totalBetCoins, b.totalBetCoins, 'The total bet'),
    totalWinCoins: sum(a.totalWinCoins, b.totalWinCoins, 'The total win'),
    sumSquaredWinCoins: wideAdd(a.sumSquaredWinCoins, b.sumSquaredWinCoins),
    hits: a.hits + b.hits,
    winsAboveBet: a.winsAboveBet + b.winsAboveBet,
    evenMoney: a.evenMoney + b.evenMoney,
    lossesDisguisedAsWins: a.lossesDisguisedAsWins + b.lossesDisguisedAsWins,
    capped: a.capped + b.capped,
    maxWin,
    drought: mergeDrought(a.drought, a.spins, b.drought, b.spins),
    winHistogram: a.winHistogram.map((n, i) => n + (b.winHistogram[i] ?? 0)),
    base: {
      winCoins: a.base.winCoins + b.base.winCoins,
      winCoinsOnLanding: a.base.winCoinsOnLanding + b.base.winCoinsOnLanding,
    },
    tricks: { ...addOutcomes(a.tricks, b.tricks), byTier: tiers },
    scarCard: {
      marksAdded: a.scarCard.marksAdded + b.scarCard.marksAdded,
      fills: a.scarCard.fills + b.scarCard.fills,
    },
    sessions: {
      triggers: {
        flyers3: a.sessions.triggers.flyers3 + b.sessions.triggers.flyers3,
        flyers4: a.sessions.triggers.flyers4 + b.sessions.triggers.flyers4,
        flyers5: a.sessions.triggers.flyers5 + b.sessions.triggers.flyers5,
        scarCard: a.sessions.triggers.scarCard + b.sessions.triggers.scarCard,
      },
      spins: a.sessions.spins + b.sessions.spins,
      winCoins: a.sessions.winCoins + b.sessions.winCoins,
      winCoinsFromFlyers: a.sessions.winCoinsFromFlyers + b.sessions.winCoinsFromFlyers,
      winCoinsFromScarCard: a.sessions.winCoinsFromScarCard + b.sessions.winCoinsFromScarCard,
      attempts: addOutcomes(a.sessions.attempts, b.sessions.attempts),
      endReasons: {
        'spins-out': a.sessions.endReasons['spins-out'] + b.sessions.endReasons['spins-out'],
        'pain-limit': a.sessions.endReasons['pain-limit'] + b.sessions.endReasons['pain-limit'],
        'max-win': a.sessions.endReasons['max-win'] + b.sessions.endReasons['max-win'],
      },
      lengths: addCounts(a.sessions.lengths, b.sessions.lengths),
      finalMultipliers: addCounts(a.sessions.finalMultipliers, b.sessions.finalMultipliers),
      finalRungs: addCounts(a.sessions.finalRungs, b.sessions.finalRungs),
    },
    injuries,
  };
}

/** Merges accumulators given in spin order. */
export function mergeAllStats(parts: readonly SimulationStats[]): SimulationStats {
  return parts.reduce(mergeStats, emptyStats());
}

/**
 * The canonical form: count maps with their keys in numeric order, so that two equal
 * accumulators also serialise to the same JSON. {@link mergeStats} always returns it.
 */
export function normalise(stats: SimulationStats): SimulationStats {
  return {
    ...stats,
    sessions: {
      ...stats.sessions,
      lengths: sortCounts(stats.sessions.lengths),
      finalMultipliers: sortCounts(stats.sessions.finalMultipliers),
      finalRungs: sortCounts(stats.sessions.finalRungs),
    },
  };
}

// --------------------------------------------------------------------- summary

/**
 * A figure measured from spins. `theoretical` is the analyser's value for the same figure,
 * or null; {@link summarise} always leaves it null and only {@link withTheoretical} sets it,
 * from values the analyser labelled theoretical. The two are never mixed up or averaged.
 */
export interface ObservedFigure<T> {
  readonly kind: 'observed';
  readonly value: T;
  readonly theoretical: Theoretical<T> | null;
}

function observed<T>(value: T): ObservedFigure<T> {
  return { kind: 'observed', value, theoretical: null };
}

export interface SimulationSummary {
  /** What every figure here is. The panel says "simulated" or "observed", never plain "RTP". */
  readonly label: 'observed';
  readonly configId: string;
  readonly masterSeed: string;
  readonly costCoins: number;
  readonly spins: number;
  readonly firstSpinIndex: number;
  readonly lastSpinIndex: number;
  readonly totalBetCoins: number;
  readonly totalWinCoins: number;
  readonly netCoins: number;

  /** Total win ÷ total bet. */
  readonly rtp: ObservedFigure<number>;
  /**
   * The sample standard error of the observed RTP, σ̂/√N, and its 95% interval by the normal
   * approximation. Null below 2 spins. For a pass/fail check against the analyser use
   * `checkTolerance` in `verify.ts`, which uses the theoretical σ instead (DR-006).
   */
  readonly rtpStandardError: number | null;
  readonly rtpInterval95: { readonly low: number; readonly high: number; readonly method: 'normal-approximation' } | null;
  /** Sample standard deviation of one paid spin's payout, × bet. Null below 2 spins. */
  readonly sigma: ObservedFigure<number | null>;

  readonly hitFrequency: ObservedFigure<number>;
  readonly winAboveBetFrequency: ObservedFigure<number>;
  readonly ldwFrequency: ObservedFigure<number>;
  /** Base-game trick attempts per paid spin. */
  readonly trickRate: ObservedFigure<number>;
  /** Landed ÷ attempted, base game; null with no attempts. */
  readonly trickLandRate: ObservedFigure<number | null>;
  /** Sessions per paid spin. */
  readonly sessionRate: ObservedFigure<number>;
  /** Paid spins that reached the cap, per paid spin. */
  readonly capProbability: ObservedFigure<number>;
  /** Shares of the total bet paid back by each part. They sum to the RTP before the cap. */
  readonly rtpSplit: ObservedFigure<{
    readonly baseWays: number;
    readonly trickLandings: number;
    readonly sessionFromFlyers: number;
    readonly sessionFromScarCard: number;
  }>;
  /** The largest observed win, never to be shown as the max win. */
  readonly largestObservedWin: { readonly coins: number; readonly timesBet: number; readonly spinIndex: number };
  readonly longestDrought: number;
  readonly winHistogram: readonly { readonly bucket: string; readonly count: number }[];
  /** The accumulator these figures came from, with every raw count. */
  readonly counts: SimulationStats;
}

/** The observed figures of an accumulator. Refuses an empty one. */
export function summarise(stats: SimulationStats): SimulationSummary {
  if (stats.spins === 0) throw new Error('No spins to summarise.');
  const n = stats.spins;
  const cost = stats.costCoins as number;
  const bet = stats.totalBetCoins;
  const rtp = stats.totalWinCoins / bet;

  let sigma: number | null = null;
  if (n >= 2) {
    // Exact numerator N·Σw² − (Σw)², in coins², then one division.
    const N = BigInt(n);
    const W = BigInt(stats.totalWinCoins);
    const num = N * wideToBigInt(stats.sumSquaredWinCoins) - W * W;
    const variance = Number(num) / (n * (n - 1)) / (cost * cost);
    sigma = Math.sqrt(Math.max(0, variance));
  }
  const se = sigma === null ? null : sigma / Math.sqrt(n);
  const maxWin = stats.maxWin as MaxWin;
  const noLanding = stats.base.winCoins - stats.base.winCoinsOnLanding;

  return {
    label: 'observed',
    configId: stats.configId as string,
    masterSeed: stats.masterSeed as string,
    costCoins: cost,
    spins: n,
    firstSpinIndex: stats.firstSpinIndex as number,
    lastSpinIndex: stats.lastSpinIndex as number,
    totalBetCoins: bet,
    totalWinCoins: stats.totalWinCoins,
    netCoins: stats.totalWinCoins - bet,
    rtp: observed(rtp),
    rtpStandardError: se,
    rtpInterval95: se === null ? null : { low: rtp - 1.96 * se, high: rtp + 1.96 * se, method: 'normal-approximation' },
    sigma: observed(sigma),
    hitFrequency: observed(stats.hits / n),
    winAboveBetFrequency: observed(stats.winsAboveBet / n),
    ldwFrequency: observed(stats.lossesDisguisedAsWins / n),
    trickRate: observed(stats.tricks.attempts / n),
    trickLandRate: observed(stats.tricks.attempts === 0 ? null : stats.tricks.landed / stats.tricks.attempts),
    sessionRate: observed(sessionCount(stats) / n),
    capProbability: observed(stats.capped / n),
    rtpSplit: observed({
      baseWays: noLanding / bet,
      trickLandings: stats.base.winCoinsOnLanding / bet,
      sessionFromFlyers: stats.sessions.winCoinsFromFlyers / bet,
      sessionFromScarCard: stats.sessions.winCoinsFromScarCard / bet,
    }),
    largestObservedWin: { coins: maxWin.coins, timesBet: maxWin.coins / cost, spinIndex: maxWin.spinIndex },
    longestDrought: stats.drought.longest,
    winHistogram: stats.winHistogram.map((count, i) => ({ bucket: WIN_HISTOGRAM_LABELS[i] as string, count })),
    counts: stats,
  };
}

function sessionCount(stats: SimulationStats): number {
  const t = stats.sessions.triggers;
  return t.flyers3 + t.flyers4 + t.flyers5 + t.scarCard;
}

/** The analyser's figures that have an observed counterpart in {@link SimulationSummary}. */
export interface TheoreticalFigures {
  readonly rtp?: Theoretical<number>;
  readonly sigma?: Theoretical<number>;
  readonly hitFrequency?: Theoretical<number>;
  readonly winAboveBetFrequency?: Theoretical<number>;
  readonly ldwFrequency?: Theoretical<number>;
  readonly trickRate?: Theoretical<number>;
  readonly sessionRate?: Theoretical<number>;
  readonly capProbability?: Theoretical<number>;
}

const PAIRED_FIGURES = [
  'rtp',
  'sigma',
  'hitFrequency',
  'winAboveBetFrequency',
  'ldwFrequency',
  'trickRate',
  'sessionRate',
  'capProbability',
] as const;

/**
 * The summary with each figure's `theoretical` slot set from the analyser. Takes only values
 * labelled `kind: 'theoretical'`, so a simulated number cannot be passed off as one; a
 * `TheoreticalReport` from `analyse` fits directly. Observed values are unchanged.
 */
export function withTheoretical(summary: SimulationSummary, figures: TheoreticalFigures): SimulationSummary {
  const out: { [key: string]: unknown } = { ...summary };
  for (const key of PAIRED_FIGURES) {
    const theo = figures[key];
    if (theo === undefined) continue;
    if (theo.kind !== 'theoretical') throw new Error(`The value for ${key} is not labelled theoretical.`);
    out[key] = { ...summary[key], theoretical: theo };
  }
  return out as unknown as SimulationSummary;
}
