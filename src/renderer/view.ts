import type { InjuryLevel, Position, RiderId, SymbolId } from '../engine';
import { sceneAt, type SceneState, type SpinRef, type Timeline, type TimelineEvent, type TimelineEventKind } from '../presentation';

/**
 * What the scene draws at presentation time `t`: a pure function of the timeline and `t`
 * (DR-007, DR-014). The Pixi scene keeps no animation state of its own; it draws whatever
 * `viewAt` returns, so playing, seeking, turbo and skip all land on exactly the same picture
 * for the same `t`, and the browser tests can read it back through the snapshot.
 *
 * Nothing here decides anything (AGENTS.md rule 4): every symbol, rider, trick, outcome,
 * injury and amount is copied from an event, and the only numbers made here are positions,
 * fades and the like, from how far through its event `t` is.
 *
 * Milestone 4 seams (DR-015): {@link RiderView.clip} names the rig clip to play and its
 * progress, and {@link CardView.heldFrame} names the painted held frame to show after the
 * cut. The placeholder layer draws shapes for both; the art replaces the drawing, not this.
 */

/** One reel's column. */
export interface ReelView {
  /** The window as stopped, top row first; null while the reel spins. */
  readonly symbols: readonly SymbolId[] | null;
  /** The strip index of the window's top symbol, once stopped. */
  readonly stop: number | null;
  /** A base landing has turned this reel wild (shown staggered while the beat plays). */
  readonly wild: boolean;
  /** 0 to 1: how far a spinning reel's blur has scrolled; always 0 under reduced motion. */
  readonly spinOffset: number;
  /** 1 as the reel lands, easing to 0: the settle drop. Always 0 under reduced motion. */
  readonly settle: number;
}

/** Which motion beat the rider is in. Milestone 4 plays a rig clip per beat. */
export type RiderPose = 'approach' | 'air' | 'landed' | 'falling';

export interface RiderView {
  readonly rider: RiderId;
  readonly pose: RiderPose;
  /** Along the lane, 0 at the left edge of the reels and 1 at the right. */
  readonly x: number;
  /** 0 on the ground, 1 at the top of the jump. */
  readonly lift: number;
  /** Radians. */
  readonly rotation: number;
  /** 0 to 1; a reduced-motion crossfade fades the pose instead of moving it. */
  readonly alpha: number;
  /** Where the ramp is along the lane: the Kicker's reel in the base game, the middle in the Session. */
  readonly rampX: number;
  readonly label: string;
  /** The seam for DR-015's rig: which clip and how far through it. */
  readonly clip: { readonly kind: 'approach' | 'trick' | 'land' | 'bail'; readonly id: string; readonly progress: number };
}

export type CardTone = 'neutral' | 'good' | 'bad' | 'hurt';

export interface CardView {
  /** The event kind the card belongs to. */
  readonly kind: TimelineEventKind;
  /** The injury card's level, or `patched-up` for every patch-up and the closing card. */
  readonly level: InjuryLevel | null;
  readonly title: string;
  readonly lines: readonly string[];
  readonly tone: CardTone;
  /** Under gore Mild: the card draws no blood. */
  readonly bloodHidden: boolean;
  /** The closing card's "friend filming on a phone" frame (DR-010). */
  readonly friendFilming: boolean;
  /** 0 to 1, the card's fade-in. */
  readonly alpha: number;
  /** The seam for DR-015's painted held frames: which still to show. Null for a plain information card. */
  readonly heldFrame: { readonly rider: RiderId; readonly level: InjuryLevel; readonly injuryId: string | null; readonly bloodHidden: boolean } | null;
}

export interface SceneView {
  readonly time: number;
  readonly duration: number;
  readonly done: boolean;
  /** The active event's kind; null at the very end. */
  readonly activeKind: TimelineEventKind | null;
  /** The active event is marked reduced motion: no camera move, shake or flash. */
  readonly reduced: boolean;
  readonly spin: SpinRef;
  readonly caption: string;
  readonly reels: readonly ReelView[];
  /** Strip stops of the reels stopped so far; null for a reel still spinning. */
  readonly stops: readonly (number | null)[];
  readonly wildReels: readonly number[];
  /** The Kicker the base trick launches from, once the trick has begun. */
  readonly kicker: Position | null;
  /** Positions outlined: the active win, or every win of this spin once they have all shown. */
  readonly highlights: readonly Position[];
  /** The active win's line, with its amount in credits. */
  readonly winLabel: string | null;
  readonly rider: RiderView | null;
  /** 0 to 1: the white cut-away flash at a bail's contact. Always 0 under reduced motion. */
  readonly flash: number;
  readonly card: CardView | null;
  readonly scarCard: { readonly marks: number; readonly size: number; readonly change: 'mark' | 'fill' | 'hold' | null };
  readonly session: SceneState['session'];
  /** The win meter, in credits: 0 until the count-up, then counting to the total. */
  readonly winCredits: number;
  readonly countingUp: boolean;
  readonly narration: string;
}

/** The part of a bail before contact; the cut-away comes at this fraction of the impact beat. */
export const BAIL_CUT_AT = 0.45;
/** How long a spinning reel's blur takes to scroll one cell, in presentation ms. */
export const SPIN_PERIOD = 90;
/** The fraction of an information card's beat spent fading in. */
const CARD_FADE = 0.15;

const LEVEL_TITLE: { readonly [L in InjuryLevel]: string } = {
  scuffed: 'SCUFFED',
  bleeding: 'BLEEDING',
  broken: 'BROKEN',
  'patched-up': 'PATCHED UP',
};

function humanise(id: string): string {
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function name(rider: RiderId): string {
  return humanise(rider);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function credits(coins: number, betLevel: number): string {
  return (coins * betLevel).toLocaleString('en-US');
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);

/** The single event active at `t` (events run back to back), or null at the end. */
function activeEvent(timeline: Timeline, t: number): TimelineEvent | null {
  for (const e of timeline.events) {
    if (e.start > t) break;
    if (t < e.start + e.duration) return e;
  }
  return null;
}

/** Facts about the current spin that `sceneAt` does not fold: stops, the Kicker, the wins so far. */
interface SpinFold {
  stops: (number | null)[];
  kicker: Position | null;
  wins: Position[][];
  rampX: number;
}

function foldSpin(timeline: Timeline, t: number): SpinFold {
  const fold: SpinFold = { stops: [], kicker: null, wins: [], rampX: 0.5 };
  for (const e of timeline.events) {
    if (e.start > t) break;
    switch (e.kind) {
      case 'reels-spin-up':
        fold.stops = Array.from({ length: timeline.reelCount }, () => null);
        fold.kicker = null;
        fold.wins = [];
        fold.rampX = 0.5;
        break;
      case 'reel-stop':
        fold.stops[e.reel] = e.stop;
        break;
      case 'trick-approach':
        fold.kicker = e.kicker;
        fold.rampX = e.kicker === null ? 0.5 : (e.kicker.reel + 0.5) / timeline.reelCount;
        break;
      case 'win-highlight':
        fold.wins.push([...e.positions]);
        break;
      default:
        break;
    }
  }
  return fold;
}

function uniquePositions(lists: readonly (readonly Position[])[]): Position[] {
  const seen = new Set<string>();
  const out: Position[] = [];
  for (const list of lists) {
    for (const p of list) {
      const key = `${p.reel},${p.row}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(p);
      }
    }
  }
  return out;
}

function riderView(e: TimelineEvent, p: number, rampX: number, reduced: boolean): RiderView | null {
  const base = { rampX };
  switch (e.kind) {
    case 'trick-approach':
      return {
        ...base,
        rider: e.rider,
        pose: 'approach',
        x: reduced ? rampX - 0.08 : -0.05 + (rampX - 0.03) * easeOut(p),
        lift: 0,
        rotation: 0,
        alpha: reduced ? clamp01(p * 2) : 1,
        label: `${name(e.rider)} rolls in`,
        clip: { kind: 'approach', id: 'ride-in', progress: p },
      };
    case 'trick': {
      const what = e.tier !== null ? humanise(e.tier) : `rung ${e.rung ?? 0}`;
      return {
        ...base,
        rider: e.rider,
        pose: 'air',
        x: reduced ? rampX + 0.08 : rampX + 0.16 * p,
        lift: reduced ? 1 : Math.sin(Math.PI * p),
        rotation: reduced ? 0 : 2 * Math.PI * easeOut(p),
        alpha: 1,
        label: `${humanise(e.trickId)} (${what})`,
        clip: { kind: 'trick', id: e.trickId, progress: p },
      };
    }
    case 'trick-land':
      return {
        ...base,
        rider: e.rider,
        pose: 'landed',
        x: reduced ? rampX + 0.2 : rampX + 0.16 + 0.08 * easeOut(p),
        lift: 0,
        rotation: 0,
        alpha: 1,
        label: 'LANDED!',
        clip: { kind: 'land', id: e.trickId, progress: p },
      };
    case 'bail-impact': {
      // The cut-away: the rider is drawn only before contact and the impact is never shown (DR-009).
      if (reduced) {
        return {
          ...base,
          rider: e.rider,
          pose: 'falling',
          x: rampX + 0.12,
          lift: 0.4,
          rotation: 0,
          alpha: clamp01(1 - p),
          label: 'BAIL!',
          clip: { kind: 'bail', id: e.animationId, progress: p },
        };
      }
      if (p >= BAIL_CUT_AT) return null;
      const q = p / BAIL_CUT_AT;
      return {
        ...base,
        rider: e.rider,
        pose: 'falling',
        x: rampX + 0.16 + 0.06 * q,
        lift: 0.6 * (1 - q),
        rotation: 1.6 * q,
        alpha: 1,
        label: 'BAIL!',
        clip: { kind: 'bail', id: e.animationId, progress: p },
      };
    }
    default:
      return null;
  }
}

function cardView(e: TimelineEvent, p: number, betLevel: number): CardView | null {
  const plain = { level: null, tone: 'neutral' as CardTone, bloodHidden: false, friendFilming: false, alpha: clamp01(p / CARD_FADE), heldFrame: null };
  switch (e.kind) {
    case 'injury':
      return {
        ...plain,
        kind: e.kind,
        level: e.level,
        title: LEVEL_TITLE[e.level],
        lines: [name(e.rider), humanise(e.injuryId)],
        tone: 'hurt',
        bloodHidden: e.bloodHidden,
        heldFrame: { rider: e.rider, level: e.level, injuryId: e.injuryId, bloodHidden: e.bloodHidden },
      };
    case 'patch-up':
      return {
        ...plain,
        kind: e.kind,
        level: 'patched-up',
        title: 'PATCHED UP',
        lines: e.replaces === null ? [`${name(e.rider)} is okay`] : [`${name(e.rider)} is okay`, 'That one was bad (gore Mild shows the patch-up)'],
        tone: 'good',
        bloodHidden: e.bloodHidden,
        heldFrame: { rider: e.rider, level: 'patched-up', injuryId: null, bloodHidden: e.bloodHidden },
      };
    case 'scar-card':
      return {
        ...plain,
        kind: e.kind,
        title: e.change === 'fill' ? 'SCAR CARD FULL' : e.change === 'hold' ? 'SCAR CARD HOLDS' : 'SCAR CARD +1',
        lines: [e.change === 'fill' ? 'The Session is on' : `${e.after} of ${e.size} marks`],
        tone: 'bad',
      };
    case 'session-trigger':
      return {
        ...plain,
        kind: e.kind,
        title: 'SESSION!',
        lines: [e.positions.length > 0 ? `${plural(e.positions.length, 'Flyer')}` : 'The Scar Card filled'],
        tone: 'good',
      };
    case 'session-intro':
      return {
        ...plain,
        kind: e.kind,
        title: 'THE SESSION',
        lines: [`${name(e.rider)} rides`, plural(e.startingSpins, 'free spin'), `Rung ${e.ladder.rung}, ×${e.ladder.multiplier}`],
      };
    case 'free-spin':
      return { ...plain, kind: e.kind, title: `FREE SPIN ${e.index + 1}`, lines: [`${e.spinsLeftBefore} to play`] };
    case 'ladder-climb':
      return {
        ...plain,
        kind: e.kind,
        title: e.topHeld ? 'TOP RUNG HELD' : 'CLIMB!',
        lines: [`Rung ${e.from.rung} → ${e.to.rung}`, `×${e.from.multiplier} → ×${e.to.multiplier}`],
        tone: 'good',
      };
    case 'pain':
      return {
        ...plain,
        kind: e.kind,
        title: 'PAIN',
        lines: [`Pain ${e.from.pain} → ${e.to.pain}`, e.spinsAdded > 0 ? `+${plural(e.spinsAdded, 'spin')}` : 'No spins added', `${e.spinsLeftAfter} left`],
        tone: 'bad',
      };
    case 'spin-win':
      return {
        ...plain,
        kind: e.kind,
        title: 'WIN',
        lines: e.runningTotalCoins === null ? [credits(e.coins, betLevel)] : [credits(e.coins, betLevel), `Session ${credits(e.runningTotalCoins, betLevel)}`],
        tone: 'good',
      };
    case 'session-end':
      return { ...plain, kind: e.kind, title: 'SESSION OVER', lines: [humanise(e.reason), plural(e.spinsPlayed, 'spin')] };
    case 'closing-card':
      return {
        ...plain,
        kind: e.kind,
        level: e.level,
        title: 'PATCHED UP',
        lines: [`${name(e.rider)} is okay`, humanise(e.injuryId)],
        tone: 'good',
        bloodHidden: e.bloodHidden,
        friendFilming: true,
        heldFrame: { rider: e.rider, level: e.level, injuryId: e.injuryId, bloodHidden: e.bloodHidden },
      };
    case 'session-total':
      return { ...plain, kind: e.kind, title: 'SESSION TOTAL', lines: [credits(e.coins, betLevel)], tone: 'good' };
    default:
      return null;
  }
}

/** The scene at presentation time `t`, clamped to the timeline. */
export function viewAt(timeline: Timeline, time: number): SceneView {
  const t = Math.min(timeline.duration, Math.max(0, time));
  const scene = sceneAt(timeline, t);
  const fold = foldSpin(timeline, t);
  const active = activeEvent(timeline, t);
  const p = active === null ? 1 : clamp01((t - active.start) / active.duration);
  const reduced = active?.motion === 'reduced' || timeline.options.reducedMotion;

  // A landing's reels turn wild one after another while its beat plays.
  let wildReels = scene.wildReels;
  if (active?.kind === 'wild-reels' && !reduced) {
    wildReels = active.reels.slice(0, Math.max(1, Math.ceil(p * active.reels.length)));
  }

  const reels: ReelView[] = Array.from({ length: timeline.reelCount }, (_, reel) => {
    const symbols = scene.reels[reel] ?? null;
    const settling = active?.kind === 'reel-stop' && active.reel === reel && !reduced;
    return {
      symbols,
      stop: fold.stops[reel] ?? null,
      wild: symbols !== null && wildReels.includes(reel),
      spinOffset: symbols === null && !reduced ? ((t / SPIN_PERIOD) + reel * 0.37) % 1 : 0,
      settle: settling ? 1 - easeOut(p) : 0,
    };
  });

  let highlights: Position[] = [];
  let winLabel: string | null = null;
  if (active?.kind === 'win-highlight') {
    highlights = [...active.positions];
    const each = `${humanise(active.symbol)} on ${active.length} reels, ${plural(active.ways, 'way')}: ${credits(active.coins, timeline.betLevel)}`;
    winLabel = active.multiplier > 1 ? `${each} ×${active.multiplier}` : each;
  } else {
    highlights = uniquePositions(fold.wins);
  }

  const flash = active?.kind === 'bail-impact' && !reduced && p >= BAIL_CUT_AT ? clamp01(1 - (p - BAIL_CUT_AT) / (1 - BAIL_CUT_AT)) : 0;
  const counting = active?.kind === 'count-up';
  const caption = scene.spin.phase === 'base' ? 'Paid spin' : `Free spin ${scene.spin.index + 1}`;

  return {
    time: t,
    duration: timeline.duration,
    done: t >= timeline.duration,
    activeKind: active?.kind ?? null,
    reduced,
    spin: scene.spin,
    caption,
    reels,
    stops: fold.stops,
    wildReels: [...wildReels],
    kicker: fold.kicker,
    highlights,
    winLabel,
    rider: active === null ? null : riderView(active, p, fold.rampX, reduced),
    flash,
    card: active === null ? null : cardView(active, p, timeline.betLevel),
    scarCard: { ...scene.scarCard, change: active?.kind === 'scar-card' ? active.change : null },
    session: scene.session,
    winCredits: scene.winCoins * timeline.betLevel,
    countingUp: counting,
    narration: scene.narration,
  };
}
