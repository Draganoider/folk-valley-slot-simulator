import type { InjuryLevel, RiderId, SymbolId, TrickTierId } from './config';
import type { RngVersion } from './rng';

/**
 * The spin result: plain data recording everything one paid spin decided (DR-005, DR-011).
 *
 * It is the presentation's only input (AGENTS.md rule 4). Presentation turns it into a
 * timeline and never changes it, and nothing shown has to be reconstructed from anything
 * else. It contains no functions, classes, Maps or undefined values, so it survives
 * `structuredClone`, `postMessage` from a Worker and a JSON round trip unchanged.
 *
 * Amounts are integer coins (see `config.ts`); credits are coins × `betLevel`.
 * Reels are 0–4 and rows 0–2 from the top.
 *
 * Changing the shape is a new {@link RESULT_FORMAT_VERSION}.
 */
export const RESULT_FORMAT_VERSION = 1 as const;

/** The visible symbols, `grid[reel][row]`. */
export type Grid = readonly (readonly SymbolId[])[];

export interface Position {
  readonly reel: number;
  readonly row: number;
}

/** One ways win: a symbol on reels 1 to `length`, counted across every row. */
export interface WaysWin {
  readonly symbol: SymbolId;
  /** 3, 4 or 5: the win runs over reels 0 to length − 1. */
  readonly length: 3 | 4 | 5;
  /** The product, over those reels, of positions showing the symbol or a wild. */
  readonly ways: number;
  /** Coins per way from the paytable. */
  readonly payPerWay: number;
  /** payPerWay × ways, before any multiplier. */
  readonly coins: number;
  /** Every position that takes part, wilds included, for highlighting. */
  readonly positions: readonly Position[];
}

/** What a bail shows. The level follows from the rules; the ids come from the cosmetic stream. */
export interface BailDetail {
  readonly animationId: string;
  readonly injury: { readonly level: InjuryLevel; readonly id: string };
}

/** A base-game trick attempt, started by the leftmost Kicker. */
export interface BaseTrickAttempt {
  readonly rider: RiderId;
  readonly tier: TrickTierId;
  /** The Kicker the rider launches from: the leftmost on the grid, topmost on its reel. */
  readonly kicker: Position;
  /** Cosmetic: which trick of the tier and the rider's discipline is shown. */
  readonly trickId: string;
  readonly outcome: 'landed' | 'bailed';
  /** Reels turned fully wild by a landing, the Kicker's own first. Empty on a bail. */
  readonly wildReels: readonly number[];
  /** Multiplier on the spin's ways win from a landing; 1 otherwise. */
  readonly winMultiplier: number;
  /** Present exactly when the attempt bailed. */
  readonly bail: BailDetail | null;
}

export interface FlyerCount {
  readonly count: number;
  readonly positions: readonly Position[];
}

export interface BaseSpin {
  /** The top stop of each reel's window, an index into that reel's strip. */
  readonly stops: readonly number[];
  /** The grid as the reels stopped, before any landing turns reels wild. */
  readonly grid: Grid;
  /** At most one per spin; null when no Kicker landed. */
  readonly attempt: BaseTrickAttempt | null;
  readonly flyers: FlyerCount;
  /** Evaluated on the grid with the attempt's wild reels applied. */
  readonly wins: readonly WaysWin[];
  /** Sum of the wins' coins × the attempt's multiplier. */
  readonly winCoins: number;
}

/** The Scar Card of the bet level this spin was played at. */
export interface ScarCardChange {
  readonly betLevel: number;
  readonly size: number;
  /** Marks before the spin. */
  readonly before: number;
  /** Marks after the spin: before + 1 on a bail, 0 if the card filled. */
  readonly after: number;
  /** The bail filled the card, which starts a Session in this same result. */
  readonly filled: boolean;
}

export type SessionTrigger =
  | { readonly kind: 'flyers'; readonly count: 3 | 4 | 5 }
  | { readonly kind: 'scar-card' };

/** One free spin's attempt from the current rung, made before its win is counted. */
export interface SessionAttempt {
  readonly rider: RiderId;
  readonly rung: number;
  /** Cosmetic, from the rung's `trickTier` and the rider's discipline. */
  readonly trickId: string;
  readonly outcome: 'landed' | 'bailed';
  readonly bail: BailDetail | null;
}

export interface LadderState {
  readonly rung: number;
  readonly multiplier: number;
  readonly pain: number;
}

export interface SessionSpin {
  /** 0-based, in order played. */
  readonly index: number;
  readonly stops: readonly number[];
  readonly grid: Grid;
  readonly attempt: SessionAttempt;
  readonly ladderBefore: LadderState;
  /** The multiplier here is the one this spin's win is multiplied by. */
  readonly ladderAfter: LadderState;
  /** Free spins left before this one was played, counting it. */
  readonly spinsLeftBefore: number;
  /** Spins this spin's bail added. */
  readonly spinsAdded: number;
  /** Free spins left after this one. */
  readonly spinsLeftAfter: number;
  readonly wins: readonly WaysWin[];
  /** Sum of the wins' coins × ladderAfter.multiplier, cut down if it reaches the cap. */
  readonly winCoins: number;
  /** Session total after this spin. */
  readonly runningTotalCoins: number;
}

export interface SessionResult {
  readonly trigger: SessionTrigger;
  /** The rider for the whole Session. */
  readonly rider: RiderId;
  readonly startingSpins: number;
  readonly startRung: number;
  readonly spins: readonly SessionSpin[];
  readonly endReason: 'spins-out' | 'pain-limit' | 'max-win';
  /** The closing card every Session ends with: always `patched-up`. */
  readonly closing: { readonly level: InjuryLevel; readonly id: string };
  readonly totalWinCoins: number;
}

export interface SpinResult {
  readonly formatVersion: typeof RESULT_FORMAT_VERSION;
  readonly rngVersion: RngVersion;
  readonly configId: string;
  /** Canonical 16-digit hex. With the spin index, the configuration and the Scar Card before, it replays this result. */
  readonly masterSeed: string;
  readonly spinIndex: number;
  /** Credits per coin. */
  readonly betLevel: number;
  /** What the spin cost, in coins. */
  readonly costCoins: number;
  readonly base: BaseSpin;
  readonly scarCard: ScarCardChange;
  /** Null unless the spin started a Session, which is then resolved here in full. */
  readonly session: SessionResult | null;
  /** Everything the spin paid, base and Session, after the cap. */
  readonly totalWinCoins: number;
  /** The total reached the max-win cap and was cut to it. */
  readonly capped: boolean;
}
