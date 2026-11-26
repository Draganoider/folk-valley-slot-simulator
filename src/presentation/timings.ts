import type { TimelineEventKind } from './events';

/** One beat's length in milliseconds, normally and under reduced motion. */
export interface BeatTiming {
  readonly full: number;
  /**
   * Under reduced motion. A motion beat becomes a short still crossfade, so this is small; an
   * information beat keeps its length, so the player still has time to read it.
   */
  readonly reduced: number;
}

/** Count-up length by the win as a multiple of the spin's cost: the first row whose `below` exceeds it. */
export interface CountUpStep {
  /** Win ÷ cost strictly below this; `Infinity` for the last row. */
  readonly below: number;
  readonly ms: number;
}

export interface Timings {
  /** Turbo divides every duration by this, rounding to whole milliseconds (at least 1). */
  readonly turboFactor: number;
  readonly beats: { readonly [K in Exclude<TimelineEventKind, 'count-up'>]: BeatTiming };
  /** A zero win still gets a short count-up beat, so the final state always has an event. */
  readonly countUpNoWin: BeatTiming;
  readonly countUp: readonly CountUpStep[];
}

/**
 * The default timings. Starting points to tune in playtests, not measurements; the reasoning:
 *
 * - A plain base spin (spin-up, five stops, the count-up) runs about 2 s, the usual length of a
 *   spin without a feature, so plain spins do not drag (rendering.md section 4).
 * - The bail is quick and the aftermath is the joke (mechanics.md section 6): the impact is a
 *   short cut-away, the injury and the patch-up are what the camera stays on.
 * - Session beats are a little longer than base beats, because each free spin is a sentence the
 *   player reads ("Kerb landed a 360 flip, ×5"; "Kerb bailed, pain 2, +1 spin").
 * - Bigger wins count up longer, capped at 6 s so even the max win never holds the player.
 * - Turbo is 2.5×, inside rendering.md's 2–3× range.
 */
export const DEFAULT_TIMINGS = {
  turboFactor: 2.5,
  beats: {
    'reels-spin-up': { full: 500, reduced: 120 },
    'reel-stop': { full: 200, reduced: 200 },
    'trick-approach': { full: 700, reduced: 120 },
    trick: { full: 900, reduced: 900 },
    'trick-land': { full: 500, reduced: 500 },
    'wild-reels': { full: 600, reduced: 600 },
    'bail-impact': { full: 350, reduced: 80 },
    injury: { full: 1100, reduced: 1100 },
    'patch-up': { full: 900, reduced: 900 },
    'win-highlight': { full: 450, reduced: 450 },
    'spin-win': { full: 500, reduced: 500 },
    'scar-card': { full: 700, reduced: 700 },
    'session-trigger': { full: 1200, reduced: 1200 },
    'session-intro': { full: 1500, reduced: 1500 },
    'free-spin': { full: 400, reduced: 400 },
    'ladder-climb': { full: 700, reduced: 700 },
    pain: { full: 700, reduced: 700 },
    'session-end': { full: 900, reduced: 900 },
    'closing-card': { full: 2000, reduced: 2000 },
    'session-total': { full: 1200, reduced: 1200 },
  },
  countUpNoWin: { full: 250, reduced: 250 },
  countUp: [
    { below: 1, ms: 600 },
    { below: 5, ms: 1200 },
    { below: 20, ms: 2200 },
    { below: 100, ms: 3500 },
    { below: Infinity, ms: 6000 },
  ],
} as const satisfies Timings;
