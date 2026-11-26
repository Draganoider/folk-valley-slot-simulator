import type { SceneFrame } from './frame';

export interface ShowOptions {
  /** Skip every pause and draw the end state at once (`prefers-reduced-motion`). */
  readonly reducedMotion: boolean;
}

/** What the scene is doing, for the UI and the browser tests to read. Never an input to play. */
export interface SceneSnapshot {
  readonly phase: 'idle' | 'stopping' | 'shown';
  /** How many reels have stopped on the current frame, 0 to 5. */
  readonly reelsStopped: number;
  readonly frame: SceneFrame | null;
  /** Which renderer is drawing: Pixi, or the text-only stand-in when WebGL is unavailable. */
  readonly renderer: 'pixi' | 'none';
}

/**
 * The reel scene's whole interface. The app hands it frames read from a finished result and
 * waits for each to be shown; nothing flows back that could change an outcome (rule 4). The
 * presentation timeline will drive the same calls once it lands.
 */
export interface Scene {
  /** Draws the frame (reels stop, a landing's reels turn wild, wins light up); resolves when done. */
  show(frame: SceneFrame, options: ShowOptions): Promise<void>;
  /** Sets the Scar Card meter without spinning, for a bet change or a reload. */
  setScarCard(marks: number, size: number): void;
  snapshot(): SceneSnapshot;
  destroy(): void;
}

/** A scene that draws nothing, used when WebGL cannot start, so the game still plays in text. */
export function createNullScene(): Scene {
  let frame: SceneFrame | null = null;
  return {
    show(next) {
      frame = next;
      return Promise.resolve();
    },
    setScarCard() {},
    snapshot: () => ({ phase: frame === null ? 'idle' : 'shown', reelsStopped: frame === null ? 0 : 5, frame, renderer: 'none' }),
    destroy() {},
  };
}
