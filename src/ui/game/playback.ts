import {
  DEFAULT_TIMINGS,
  TimelinePlayer,
  type Clock,
  type PlayerFrame,
  type Timeline,
} from '../../presentation';

/**
 * Plays one timeline on a clock, one frame at a time: the app passes `performance.now()` and
 * `requestAnimationFrame`, the tests a `ManualClock` and a queue. No DOM here, so it is tested
 * in Node like the rest of `game/`.
 *
 * It only reads the player; it never touches the result or the game state, so however the
 * frames fall (a long frame, turbo, skip) the outcome shown is the one decided (rule 4).
 */
export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface PlaybackHandlers {
  /** Every frame, including the first at time 0 and the last at the end. */
  readonly onFrame: (frame: PlayerFrame) => void;
  /** Once, after the frame that reached the end. */
  readonly onDone: (frame: PlayerFrame) => void;
}

/** Player speed for the turbo toggle: the presentation's own turbo factor, applied at run time. */
export function speedFor(turbo: boolean): number {
  return turbo ? DEFAULT_TIMINGS.turboFactor : 1;
}

export class Playback {
  private readonly player: TimelinePlayer;
  private handle: number | null = null;
  private finished = false;

  constructor(
    readonly timeline: Timeline,
    clock: Clock,
    private readonly scheduler: FrameScheduler,
    private readonly handlers: PlaybackHandlers,
    options: { readonly speed?: number } = {},
  ) {
    this.player = new TimelinePlayer(timeline, clock, { speed: options.speed ?? 1 });
  }

  get done(): boolean {
    return this.finished;
  }

  /** Draws time 0 at once, then a frame per animation frame until the end. */
  start(): void {
    this.emit(this.player.tick());
  }

  setSpeed(speed: number): void {
    if (!this.finished) this.player.setSpeed(speed);
  }

  pause(): void {
    if (!this.finished) this.player.pause();
  }

  resume(): void {
    if (!this.finished) this.player.resume();
  }

  /** Seeks to the end: the final state is drawn, and every event passed is in that frame's `completed`. */
  skip(): void {
    if (this.finished) return;
    this.cancel();
    this.emit(this.player.skip());
  }

  /** Stops without finishing, for unmounting. */
  stop(): void {
    this.cancel();
    this.finished = true;
  }

  private cancel(): void {
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  private emit(frame: PlayerFrame): void {
    this.handlers.onFrame(frame);
    if (frame.done) {
      this.finished = true;
      this.handle = null;
      this.handlers.onDone(frame);
      return;
    }
    this.handle = this.scheduler.request(() => {
      this.handle = null;
      if (!this.finished) this.emit(this.player.tick());
    });
  }
}

/**
 * How many steps of the paid spin the text details may describe at time `t`: 0 while the
 * base spin plays, 1 once it has resolved, then one more per free spin that has resolved. So
 * the text never tells an outcome before the scene has shown it.
 */
export function stepsShown(timeline: Timeline, t: number): number {
  let base = false;
  let sessionDone = 0;
  for (const e of timeline.events) {
    if (e.start > t) break;
    if (e.spin.phase === 'session') {
      base = true;
      sessionDone = Math.max(sessionDone, e.spin.index);
    }
    if (e.kind === 'session-end' || e.kind === 'count-up') {
      base = true;
      if (e.kind === 'session-end') sessionDone = e.spinsPlayed;
    }
  }
  if (t >= timeline.duration) return 1 + (timeline.events.find((e) => e.kind === 'session-end')?.spinsPlayed ?? 0);
  return base ? 1 + sessionDone : 0;
}
