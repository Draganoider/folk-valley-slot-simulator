import type {
  InjuryLevel,
  LadderState,
  Position,
  RiderId,
  SessionResult,
  SessionTrigger,
  SymbolId,
  TrickTierId,
} from '../engine';

/**
 * The timeline: plain data that orders and times what one `SpinResult` says (DR-007, DR-014).
 *
 * It never adds, removes or changes an outcome (AGENTS.md rule 4). Every amount, rider, trick,
 * injury and ladder value in an event is copied from the result; only the order, the timing
 * and how a beat is shown (gore, reduced motion) are presentation's own. Like the result, it
 * holds no functions, classes, Maps or `undefined`, so it survives `structuredClone` and JSON.
 *
 * Changing the shape is a new {@link TIMELINE_FORMAT_VERSION}.
 */
export const TIMELINE_FORMAT_VERSION = 1 as const;

export type GoreSetting = 'full' | 'mild';

export interface TimelineOptions {
  /** DR-009: Full shows every level; Mild swaps the `broken` beat for the patch-up and hides blood. */
  readonly gore: GoreSetting;
  /** Motion beats become short still crossfades; every information beat stays. */
  readonly reducedMotion: boolean;
  /** Every duration divided by the timings' `turboFactor`. */
  readonly turbo: boolean;
}

export const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = { gore: 'full', reducedMotion: false, turbo: false };

/**
 * `motion` beats only animate (the reels spinning, the run-up, the impact); `information`
 * beats show something the player must see (a symbol, a trick name, an injury, an amount).
 * Reduced motion may shorten or replace a motion beat but keeps every information beat.
 */
export type BeatRole = 'motion' | 'information';

/** Which spin of the paid spin an event belongs to: the base spin, or free spin `index`. */
export type SpinRef = { readonly phase: 'base' } | { readonly phase: 'session'; readonly index: number };

interface EventCommon {
  /** 0-based position in `Timeline.events`. */
  readonly id: number;
  /** Presentation milliseconds from the start of the timeline. */
  readonly start: number;
  /** Milliseconds; always at least 1, so every event is active at some time. */
  readonly duration: number;
  readonly role: BeatRole;
  /**
   * `reduced` under reduced motion, on every event: no camera move, shake, zoom or flash; a
   * motion beat is a short still crossfade, an information beat a crossfade between key poses.
   */
  readonly motion: 'full' | 'reduced';
  readonly spin: SpinRef;
  /** A place a "skip to next" may stop: after the reels, after a trick resolves, after the wins. */
  readonly skipPoint: boolean;
  /** One short sentence for an `aria-live` region (rendering.md section 6). */
  readonly narration: string;
}

/** All reels start spinning. */
export interface ReelsSpinUpEvent extends EventCommon {
  readonly kind: 'reels-spin-up';
}

/** One reel stops, left to right, showing its window as stopped (before any landing). */
export interface ReelStopEvent extends EventCommon {
  readonly kind: 'reel-stop';
  readonly reel: number;
  /** Index into the reel's strip of the window's top symbol. */
  readonly stop: number;
  /** The window, top row first. */
  readonly symbols: readonly SymbolId[];
}

/** The rider rolls in towards the Kicker (base) or the ramp (Session). */
export interface TrickApproachEvent extends EventCommon {
  readonly kind: 'trick-approach';
  readonly rider: RiderId;
  /** The Kicker launched from in the base game; null in the Session. */
  readonly kicker: Position | null;
}

/** The trick itself. The outcome is in the event that follows, not here. */
export interface TrickEvent extends EventCommon {
  readonly kind: 'trick';
  readonly rider: RiderId;
  readonly trickId: string;
  /** The base tier; null in the Session. */
  readonly tier: TrickTierId | null;
  /** The Session rung attempted from; null in the base game. */
  readonly rung: number | null;
}

/** The trick lands. */
export interface TrickLandEvent extends EventCommon {
  readonly kind: 'trick-land';
  readonly rider: RiderId;
  readonly trickId: string;
}

/** Base game only, after a landing: these reels turn fully wild and the win is re-evaluated. */
export interface WildReelsEvent extends EventCommon {
  readonly kind: 'wild-reels';
  /** The Kicker's own reel first, as in the result. */
  readonly reels: readonly number[];
  readonly winMultiplier: number;
}

/** The bail. The renderer cuts away on contact: the impact itself is never shown (DR-009). */
export interface BailImpactEvent extends EventCommon {
  readonly kind: 'bail-impact';
  readonly rider: RiderId;
  readonly animationId: string;
  readonly cutAway: true;
}

/** The injury shown after the cut, at its level. Under gore Mild there is none at `broken`. */
export interface InjuryEvent extends EventCommon {
  readonly kind: 'injury';
  readonly rider: RiderId;
  readonly level: InjuryLevel;
  readonly injuryId: string;
  /** True under gore Mild: draw no blood. */
  readonly bloodHidden: boolean;
}

/** The rider gets up okay after a bail. Every bail has one (mechanics.md section 6). */
export interface PatchUpEvent extends EventCommon {
  readonly kind: 'patch-up';
  readonly rider: RiderId;
  /**
   * Under gore Mild, the `broken` injury this patch-up stands in for (DR-009): the renderer
   * shows the patched-up card and never the injury. Null otherwise.
   */
  readonly replaces: { readonly level: InjuryLevel; readonly injuryId: string } | null;
  readonly bloodHidden: boolean;
}

/** One ways win, highlighted with its amount. */
export interface WinHighlightEvent extends EventCommon {
  readonly kind: 'win-highlight';
  readonly symbol: SymbolId;
  readonly length: 3 | 4 | 5;
  readonly ways: number;
  readonly payPerWay: number;
  /** Before the multiplier, as in the result. */
  readonly coins: number;
  /** The multiplier the spin's win is multiplied by: the landing's, or the ladder's. */
  readonly multiplier: number;
  readonly positions: readonly Position[];
}

/** What this spin paid in all: the result's `winCoins`, after any multiplier and the cap. */
export interface SpinWinEvent extends EventCommon {
  readonly kind: 'spin-win';
  readonly coins: number;
  readonly credits: number;
  /** In the Session, the Session total after this spin; null in the base game. */
  readonly runningTotalCoins: number | null;
}

/** The base bail marks the Scar Card, fills it, or the last mark is held back (DR-012). */
export interface ScarCardEvent extends EventCommon {
  readonly kind: 'scar-card';
  readonly change: 'mark' | 'fill' | 'hold';
  readonly size: number;
  readonly before: number;
  readonly after: number;
}

export interface SessionTriggerEvent extends EventCommon {
  readonly kind: 'session-trigger';
  readonly trigger: SessionTrigger;
  /** The Flyers that triggered it; empty for the Scar Card. */
  readonly positions: readonly Position[];
}

export interface SessionIntroEvent extends EventCommon {
  readonly kind: 'session-intro';
  readonly rider: RiderId;
  readonly startingSpins: number;
  readonly startRung: number;
  /** The ladder as the Session starts: the first free spin's `ladderBefore`, or the start rung at pain 0. */
  readonly ladder: LadderState;
}

/** A free spin begins. */
export interface FreeSpinEvent extends EventCommon {
  readonly kind: 'free-spin';
  readonly index: number;
  readonly spinsLeftBefore: number;
  readonly ladder: LadderState;
}

/** A Session landing: the rider climbs a rung, or holds the top one. */
export interface LadderClimbEvent extends EventCommon {
  readonly kind: 'ladder-climb';
  readonly from: LadderState;
  readonly to: LadderState;
  /** Landed on the top rung, which keeps its multiplier. */
  readonly topHeld: boolean;
}

/** A Session bail: pain rises and any extra spins are added. */
export interface PainEvent extends EventCommon {
  readonly kind: 'pain';
  readonly from: LadderState;
  readonly to: LadderState;
  readonly spinsAdded: number;
  readonly spinsLeftAfter: number;
}

export interface SessionEndEvent extends EventCommon {
  readonly kind: 'session-end';
  readonly reason: SessionResult['endReason'];
  readonly spinsPlayed: number;
}

/** The card every Session closes on: the rider patched up, a friend filming it on a phone (DR-010). */
export interface ClosingCardEvent extends EventCommon {
  readonly kind: 'closing-card';
  readonly rider: RiderId;
  readonly level: InjuryLevel;
  readonly injuryId: string;
  readonly friendFilming: true;
  readonly bloodHidden: boolean;
}

export interface SessionTotalEvent extends EventCommon {
  readonly kind: 'session-total';
  readonly coins: number;
  readonly credits: number;
}

/** The last event: the paid spin's whole win counts up from 0 to the result's total. */
export interface CountUpEvent extends EventCommon {
  readonly kind: 'count-up';
  readonly fromCoins: 0;
  readonly toCoins: number;
  readonly toCredits: number;
  readonly capped: boolean;
}

export type TimelineEvent =
  | ReelsSpinUpEvent
  | ReelStopEvent
  | TrickApproachEvent
  | TrickEvent
  | TrickLandEvent
  | WildReelsEvent
  | BailImpactEvent
  | InjuryEvent
  | PatchUpEvent
  | WinHighlightEvent
  | SpinWinEvent
  | ScarCardEvent
  | SessionTriggerEvent
  | SessionIntroEvent
  | FreeSpinEvent
  | LadderClimbEvent
  | PainEvent
  | SessionEndEvent
  | ClosingCardEvent
  | SessionTotalEvent
  | CountUpEvent;

export type TimelineEventKind = TimelineEvent['kind'];

/** Every kind, in no particular order; `BEAT_ROLES` gives each one's role. */
export const TIMELINE_EVENT_KINDS = [
  'reels-spin-up',
  'reel-stop',
  'trick-approach',
  'trick',
  'trick-land',
  'wild-reels',
  'bail-impact',
  'injury',
  'patch-up',
  'win-highlight',
  'spin-win',
  'scar-card',
  'session-trigger',
  'session-intro',
  'free-spin',
  'ladder-climb',
  'pain',
  'session-end',
  'closing-card',
  'session-total',
  'count-up',
] as const satisfies readonly TimelineEventKind[];

export const BEAT_ROLES: { readonly [K in TimelineEventKind]: BeatRole } = {
  'reels-spin-up': 'motion',
  'reel-stop': 'information',
  'trick-approach': 'motion',
  trick: 'information',
  'trick-land': 'information',
  'wild-reels': 'information',
  'bail-impact': 'motion',
  injury: 'information',
  'patch-up': 'information',
  'win-highlight': 'information',
  'spin-win': 'information',
  'scar-card': 'information',
  'session-trigger': 'information',
  'session-intro': 'information',
  'free-spin': 'information',
  'ladder-climb': 'information',
  pain: 'information',
  'session-end': 'information',
  'closing-card': 'information',
  'session-total': 'information',
  'count-up': 'information',
};

/** What the screen shows once the timeline has played to its end. */
export interface FinalState {
  readonly totalWinCoins: number;
  readonly totalWinCredits: number;
  readonly capped: boolean;
  readonly scarCardMarks: number;
  readonly scarCardSize: number;
  readonly sessionPlayed: boolean;
}

export interface Timeline {
  readonly formatVersion: typeof TIMELINE_FORMAT_VERSION;
  /** The `formatVersion` of the result it was built from. */
  readonly resultFormatVersion: number;
  readonly configId: string;
  readonly masterSeed: string;
  readonly spinIndex: number;
  readonly betLevel: number;
  readonly options: TimelineOptions;
  /** True under gore Mild: no event may draw blood. */
  readonly bloodHidden: boolean;
  /** Reels on the grid: one `reel-stop` per reel per spin. */
  readonly reelCount: number;
  /** What the screen shows before the first event. */
  readonly initial: { readonly scarCardMarks: number };
  /** Milliseconds: the end of the last event. */
  readonly duration: number;
  /** In time order, back to back: each starts where the one before it ends. */
  readonly events: readonly TimelineEvent[];
  readonly final: FinalState;
}
