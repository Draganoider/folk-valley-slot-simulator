/**
 * The game's configuration: everything the math depends on, as plain data (DR-005, DR-006).
 *
 * RTP comes only from what is here: the reel strips, the paytable and the feature weights
 * (AGENTS.md rule 4). The engine never adjusts a result after the spin. A configuration is
 * checked by `validateConfig` in `validate.ts` before the engine or the analyser uses it,
 * and validation rejects; it never clamps or rewrites.
 *
 * Units (DR-011). Every amount is an integer number of **coins**. A paid spin costs
 * `bet.coinsPerSpin` coins, and the bet level says how many virtual credits one coin is
 * worth, so a win in credits is coins × bet level. A ways pay is coins per way: a win is
 * pay × ways × any multiplier, all integers, so the analyser can work in exact integers.
 * Every probability is a pair or list of integer weights drawn with `Rng.pickWeighted`;
 * there are no floating-point probabilities anywhere.
 *
 * Indices. Reels are numbered 0–4 in code (reel 1–5 in the docs), rows 0–2 from the top.
 */

/** The four riders (DR-008). Rider symbols use these ids, and every trick attempt names one. */
export const RIDER_IDS = ['gramps', 'kerb', 'zip', 'dot'] as const;
export type RiderId = (typeof RIDER_IDS)[number];

/** Each rider's sport, which picks the trick names shown for them. */
export const DISCIPLINES = ['bmx', 'skate', 'scooter', 'flatland'] as const;
export type Discipline = (typeof DISCIPLINES)[number];

/** Base-game trick tiers, in rising difficulty. */
export const TRICK_TIER_IDS = ['easy', 'medium', 'hard'] as const;
export type TrickTierId = (typeof TRICK_TIER_IDS)[number];

/**
 * Injury levels (DR-009), in order. `scuffed` follows every base-game bail and Session pain
 * 1, `bleeding` Session pain 2, `broken` Session pain 3 only, and `patched-up` is the closing
 * card that ends every bail sequence. The in-game gore setting decides how `broken` is drawn;
 * it is presentation-only, so it is not configuration and never changes an outcome.
 */
export const INJURY_LEVELS = ['scuffed', 'bleeding', 'broken', 'patched-up'] as const;
export type InjuryLevel = (typeof INJURY_LEVELS)[number];

export type SymbolId = string;
export type SymbolKind = 'rider' | 'gear' | 'low' | 'wild' | 'scatter';

export interface SymbolDef {
  readonly id: SymbolId;
  readonly kind: SymbolKind;
}

/** Coins per way for 3, 4 and 5 of a kind. */
export interface WaysPay {
  readonly 3: number;
  readonly 4: number;
  readonly 5: number;
}

/** One reel strip: the symbols in order. The window shows `rows` consecutive stops, wrapping. */
export type ReelStrip = readonly SymbolId[];

/** A two-way draw: land with probability land / (land + bail). */
export interface LandBailWeights {
  readonly land: number;
  readonly bail: number;
}

/** What a landed base-game trick does. */
export interface LandingEffect {
  /**
   * Further reels among the wild-eligible reels (2–4) that turn fully wild, on top of the
   * Kicker's own reel, which a landing always turns wild. Which ones is an outcome draw.
   */
  readonly extraWildReels: number;
  /** Multiplies the spin's ways win. 1 for no multiplier. */
  readonly winMultiplier: number;
}

export interface TrickTier {
  readonly id: TrickTierId;
  /** Weight of this tier when a Kicker starts an attempt. */
  readonly weight: number;
  readonly odds: LandBailWeights;
  readonly landing: LandingEffect;
}

export interface RiderDef {
  readonly id: RiderId;
  readonly discipline: Discipline;
  /** Weight of this rider attempting a trick. Independent of the grid. */
  readonly weight: number;
}

/** One rung of the Session's trick ladder. */
export interface LadderRung {
  /** The multiplier on a free spin's ways win while the rider is on this rung. */
  readonly multiplier: number;
  /** The attempt made from this rung. Landing climbs one rung; on the top rung it stays. */
  readonly odds: LandBailWeights;
  /** Which trick names to show for this rung's attempt. Cosmetic only. */
  readonly trickTier: TrickTierId;
}

export interface SessionConfig {
  /** Free spins a Session starts with. */
  readonly startingSpins: number;
  /** The rung a Session starts on, by how it was triggered. Rung 0 is the bottom. */
  readonly startRung: {
    readonly flyers3: number;
    readonly flyers4: number;
    readonly flyers5: number;
    readonly scarCard: number;
  };
  /** Bottom first. Multipliers never fall as the rungs rise. */
  readonly rungs: readonly LadderRung[];
  /** A bail raises pain by one; reaching the limit ends the Session after that spin. */
  readonly painLimit: 3;
  /** Free spins a bail adds while pain is still below the limit. */
  readonly extraSpinsPerBail: number;
  /** Reel strips for free spins; may equal the base strips. */
  readonly reels: readonly ReelStrip[];
}

export interface ScarCardConfig {
  /** Marks that fill the card. The spin that adds the last mark starts a Session and resets it. */
  readonly size: number;
  /**
   * One card per bet level (DR-005): changing the bet switches cards, so a card filled at a
   * small bet can never pay out at a large one. The only value; stated so it is explicit.
   */
  readonly persistence: 'per-bet-level';
}

export interface InjuryConfig {
  /** The level shown after a base-game bail. */
  readonly baseBail: InjuryLevel;
  /** The level for a Session bail that brings pain to 1, 2 and 3, in that order. */
  readonly sessionPain: readonly [InjuryLevel, InjuryLevel, InjuryLevel];
  /** The level of the closing card after every Session and every bail. */
  readonly closing: InjuryLevel;
}

/**
 * The cosmetic catalogue: ids presentation maps to art and text. Drawn from the cosmetic
 * stream only, so adding an entry changes no outcome. Injury ids must come from
 * `INJURY_CATALOGUE` in `injuries.ts`, which is reviewed against AGENTS.md rule 8.
 */
export interface CosmeticConfig {
  readonly tricks: { readonly [D in Discipline]: { readonly [T in TrickTierId]: readonly string[] } };
  readonly bailAnimations: { readonly [D in Discipline]: readonly string[] };
  readonly injuries: { readonly [L in InjuryLevel]: readonly string[] };
}

export interface GameConfig {
  /** Names this configuration in results, findings and analyser reports. */
  readonly id: string;
  readonly grid: { readonly reels: 5; readonly rows: 3 };
  readonly bet: {
    /** Coins one paid spin costs. Ways pays are in the same coins. */
    readonly coinsPerSpin: number;
    /** Credits per coin the player can choose, ascending. Each has its own Scar Card. */
    readonly levels: readonly number[];
  };
  /** Four riders, four gear, five low, one wild (the Kicker), one scatter (the Session Flyer). */
  readonly symbols: readonly SymbolDef[];
  /** For every rider, gear and low symbol; none for the wild or the scatter. */
  readonly paytable: { readonly [symbol: SymbolId]: WaysPay };
  /** Base-game reel strips, reel 1 first. The Kicker only on reels 2–4; at most one Flyer per window. */
  readonly reels: readonly ReelStrip[];
  /** The rider drawn for each attempt, base game and Session. */
  readonly riders: readonly RiderDef[];
  /** Base-game trick tiers, easy, medium, hard in that order. */
  readonly trickTiers: readonly TrickTier[];
  readonly scarCard: ScarCardConfig;
  readonly session: SessionConfig;
  readonly injuries: InjuryConfig;
  readonly cosmetics: CosmeticConfig;
  /** The most one paid spin can pay, features included, as a multiple of its cost (2,500). */
  readonly maxWinMultiplier: number;
}

/** Number of Session Flyers that starts a Session. */
export const FLYERS_TO_TRIGGER = 3;

/** Reels (0-based) the Kicker may appear on: reels 2, 3 and 4 in the docs. */
export const WILD_REELS: readonly number[] = [1, 2, 3];

/** The most coins one paid spin can pay. */
export function maxWinCoins(config: GameConfig): number {
  return config.maxWinMultiplier * config.bet.coinsPerSpin;
}
