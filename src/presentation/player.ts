import type { LadderState, SymbolId } from '../engine';
import type { SpinRef, Timeline, TimelineEvent } from './events';

/**
 * Where the player reads time from, in milliseconds. The app passes one over
 * `performance.now()` driven by `requestAnimationFrame`; tests pass a {@link ManualClock}.
 * Only differences between readings matter.
 */
export interface Clock {
  now(): number;
}

/** A clock that moves only when told to: for tests and the browser test hook. */
export class ManualClock implements Clock {
  private t: number;

  constructor(start = 0) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  advance(ms: number): void {
    if (!(ms >= 0)) throw new RangeError(`A clock only moves forward; got ${ms}.`);
    this.t += ms;
  }
}

/** The events active at `t`: start ≤ t < start + duration. At most one, since events run back to back. */
export function activeAt(timeline: Timeline, t: number): readonly TimelineEvent[] {
  return timeline.events.filter((e) => e.start <= t && t < e.start + e.duration);
}

/** 0 at the start, 1 at the end. A timeline always has at least the count-up, so its duration is positive. */
export function progressAt(timeline: Timeline, t: number): number {
  return Math.min(1, Math.max(0, t / timeline.duration));
}

interface SessionScene {
  ladder: LadderState;
  spinsLeft: number;
  totalCoins: number;
  ended: boolean;
}

/** The information on screen at time `t`, folded from every event that has started by then. */
export interface SceneState {
  /** The spin the scene shows. */
  readonly spin: SpinRef;
  /** That spin's windows as stopped so far, null for a reel still spinning. */
  readonly reels: readonly (readonly SymbolId[] | null)[];
  /** Reels a base landing has turned wild. */
  readonly wildReels: readonly number[];
  readonly scarCard: { readonly marks: number; readonly size: number };
  /** Null until the Session's intro. */
  readonly session: {
    readonly ladder: LadderState;
    /** Free spins still to play after the one on screen. */
    readonly spinsLeft: number;
    readonly totalCoins: number;
    readonly ended: boolean;
  } | null;
  /** The win meter: 0 until the count-up, then counting up to the paid spin's total. */
  readonly winCoins: number;
  /** The narration of the latest event started. */
  readonly narration: string;
}

/**
 * The scene at time `t`, as a fold over the events: so seeking, skipping and playing reach
 * the same state at the same time. At `timeline.duration` it equals `timeline.final`.
 */
export function sceneAt(timeline: Timeline, t: number): SceneState {
  let spin: SpinRef = { phase: 'base' };
  let reels: (readonly SymbolId[] | null)[] = [];
  let wildReels: readonly number[] = [];
  let marks = timeline.initial.scarCardMarks;
  // Cast so the loop's assignments are not narrowed away: `session` is set inside the switch.
  let session = null as SessionScene | null;
  let winCoins = 0;
  let narration = '';

  for (const e of timeline.events) {
    if (e.start > t) break;
    narration = e.narration;
    switch (e.kind) {
      case 'reels-spin-up':
        spin = e.spin;
        reels = Array.from({ length: timeline.reelCount }, () => null);
        wildReels = [];
        break;
      case 'reel-stop':
        reels[e.reel] = e.symbols;
        break;
      case 'wild-reels':
        wildReels = e.reels;
        break;
      case 'scar-card':
        marks = e.after;
        break;
      case 'session-intro':
        session = { ladder: e.ladder, spinsLeft: e.startingSpins, totalCoins: 0, ended: false };
        break;
      case 'free-spin':
        if (session !== null) { session.ladder = e.ladder; session.spinsLeft = e.spinsLeftBefore - 1; }
        break;
      case 'ladder-climb':
        if (session !== null) session.ladder = e.to;
        break;
      case 'pain':
        if (session !== null) { session.ladder = e.to; session.spinsLeft = e.spinsLeftAfter; }
        break;
      case 'spin-win':
        if (session !== null && e.runningTotalCoins !== null) session.totalCoins = e.runningTotalCoins;
        break;
      case 'session-end':
        if (session !== null) session.ended = true;
        break;
      case 'session-total':
        if (session !== null) session.totalCoins = e.coins;
        break;
      case 'count-up': {
        const elapsed = t - e.start;
        winCoins = elapsed >= e.duration ? e.toCoins : Math.floor((e.toCoins * elapsed) / e.duration);
        break;
      }
      default:
        break;
    }
  }
  return {
    spin,
    reels,
    wildReels,
    scarCard: { marks, size: timeline.final.scarCardSize },
    session: session === null ? null : { ...session },
    winCoins,
    narration,
  };
}

export interface PlayerFrame {
  /** Presentation milliseconds, 0 to `timeline.duration`. */
  readonly time: number;
  readonly progress: number;
  readonly active: readonly TimelineEvent[];
  /** Events that started since the last frame, in order. */
  readonly entered: readonly TimelineEvent[];
  /**
   * Events that finished since the last frame, in order. A renderer applies each one's end
   * state, so a jump forward (turbo, skip, a long frame) still shows every outcome.
   */
  readonly completed: readonly TimelineEvent[];
  /** True when the frame went back in time: entered and completed are empty, redraw from `scene`. */
  readonly rewound: boolean;
  readonly done: boolean;
  readonly scene: SceneState;
}

export interface PlayerOptions {
  /** Presentation milliseconds per clock millisecond; 1 by default. */
  readonly speed?: number;
  readonly paused?: boolean;
}

/**
 * Plays a timeline on an injected clock (DR-007). It owns a presentation time that advances
 * by clock time × speed, and reports what is active, what started and what finished. It never
 * reads a global clock, so under a {@link ManualClock} it is deterministic.
 *
 * Turbo mid-spin is `setSpeed`; skip is `skip()`, a seek to the end that reports every event
 * it passes as completed, so nothing the result says is hidden from the player.
 */
export class TimelinePlayer {
  private t = 0;
  private last: number;
  private speedFactor: number;
  private playing: boolean;
  /** Events [0, startedCount) have started; [0, endedCount) have finished. */
  private startedCount = 0;
  private endedCount = 0;

  constructor(
    readonly timeline: Timeline,
    private readonly clock: Clock,
    options: PlayerOptions = {},
  ) {
    this.speedFactor = checkSpeed(options.speed ?? 1);
    this.playing = options.paused !== true;
    this.last = clock.now();
  }

  get time(): number {
    return this.t;
  }

  get speed(): number {
    return this.speedFactor;
  }

  get done(): boolean {
    return this.t >= this.timeline.duration;
  }

  /** Reads the clock and advances; call once per animation frame. */
  tick(): PlayerFrame {
    this.sync();
    return this.frame(false);
  }

  setSpeed(speed: number): void {
    this.sync();
    this.speedFactor = checkSpeed(speed);
  }

  pause(): void {
    this.sync();
    this.playing = false;
  }

  resume(): void {
    this.last = this.clock.now();
    this.playing = true;
  }

  /** Jumps to presentation time `t`, clamped to the timeline. */
  seek(t: number): PlayerFrame {
    this.last = this.clock.now();
    const target = Math.min(this.timeline.duration, Math.max(0, t));
    if (target < this.t) {
      this.t = target;
      this.startedCount = this.timeline.events.filter((e) => e.start <= target).length;
      this.endedCount = this.timeline.events.filter((e) => e.start + e.duration <= target).length;
      return this.frame(true);
    }
    this.t = target;
    return this.frame(false);
  }

  /** Seeks to the end: every remaining event is reported as completed, and the scene is the final state. */
  skip(): PlayerFrame {
    return this.seek(this.timeline.duration);
  }

  /** Seeks to the end of the next event marked as a skip point, or to the end. */
  skipToNextPoint(): PlayerFrame {
    const next = this.timeline.events.find((e) => e.skipPoint && e.start + e.duration > this.t);
    return this.seek(next === undefined ? this.timeline.duration : next.start + next.duration);
  }

  private sync(): void {
    const now = this.clock.now();
    if (this.playing) {
      this.t = Math.min(this.timeline.duration, this.t + Math.max(0, now - this.last) * this.speedFactor);
    }
    this.last = now;
  }

  private frame(rewound: boolean): PlayerFrame {
    const events = this.timeline.events;
    const entered: TimelineEvent[] = [];
    const completed: TimelineEvent[] = [];
    while (this.startedCount < events.length && (events[this.startedCount]?.start ?? Infinity) <= this.t) {
      const e = events[this.startedCount++];
      if (e !== undefined && !rewound) entered.push(e);
    }
    while (this.endedCount < events.length) {
      const e = events[this.endedCount];
      if (e === undefined || e.start + e.duration > this.t) break;
      this.endedCount++;
      if (!rewound) completed.push(e);
    }
    return {
      time: this.t,
      progress: progressAt(this.timeline, this.t),
      active: activeAt(this.timeline, this.t),
      entered,
      completed,
      rewound,
      done: this.done,
      scene: sceneAt(this.timeline, this.t),
    };
  }
}

function checkSpeed(speed: number): number {
  if (!(speed > 0) || !Number.isFinite(speed)) throw new RangeError(`Speed must be a positive number; got ${speed}. Use pause() to stop.`);
  return speed;
}
