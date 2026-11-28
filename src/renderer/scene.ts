import type { SceneView } from './view';

/** What the scene is doing, for the UI and the browser tests to read. Never an input to play. */
export interface SceneSnapshot {
  /** `idle` before the first spin, `playing` while a timeline plays, `shown` at its end. */
  readonly phase: 'idle' | 'playing' | 'shown';
  /** How many reels of the spin on screen have stopped, 0 to 5. */
  readonly reelsStopped: number;
  /** The view last drawn; null before the first spin. */
  readonly view: SceneView | null;
  /**
   * Every card drawn since the timeline began, in order and without repeats in a row, as
   * `kind` or `kind:level` (for example `injury:broken`). Lets a test check what was ever on
   * screen, such as no `broken` card under gore Mild.
   */
  readonly cardsSeen: readonly string[];
  /** Which renderer is drawing: Pixi, or the text-only stand-in when WebGL is unavailable. */
  readonly renderer: 'pixi' | 'none';
}

/**
 * The reel scene's whole interface. The app plays a timeline and hands the scene the view at
 * each frame's time; the scene draws that view and runs no animation of its own, so a seek
 * is exact. Nothing flows back that could change an outcome (rule 4).
 */
export interface Scene {
  /** A new timeline is about to play: forget what the last one showed. */
  begin(): void;
  /** Draws the scene at one moment, from `viewAt(timeline, t)`. */
  render(view: SceneView): void;
  /** Sets the Scar Card meter outside a timeline, for a bet change or a reload. */
  setScarCard(marks: number, size: number): void;
  snapshot(): SceneSnapshot;
  destroy(): void;
}

function cardKey(view: SceneView): string | null {
  const card = view.card;
  if (card === null) return null;
  return card.level === null ? card.kind : `${card.kind}:${card.level}`;
}

/** Keeps what the snapshot reports; shared by the Pixi scene and the text-only stand-in. */
export class SceneRecorder {
  private view: SceneView | null = null;
  private seen: string[] = [];

  begin(): void {
    this.view = null;
    this.seen = [];
  }

  record(view: SceneView): void {
    this.view = view;
    const key = cardKey(view);
    if (key !== null && this.seen.at(-1) !== key) this.seen.push(key);
  }

  snapshot(renderer: SceneSnapshot['renderer']): SceneSnapshot {
    const view = this.view;
    return {
      phase: view === null ? 'idle' : view.done ? 'shown' : 'playing',
      reelsStopped: view === null ? 0 : view.reels.filter((r) => r.symbols !== null).length,
      view,
      cardsSeen: [...this.seen],
      renderer,
    };
  }
}

/** A scene that draws nothing, used when WebGL cannot start, so the game still plays in text. */
export function createNullScene(): Scene {
  const recorder = new SceneRecorder();
  return {
    begin: () => recorder.begin(),
    render: (view) => recorder.record(view),
    setScarCard() {},
    snapshot: () => recorder.snapshot('none'),
    destroy() {},
  };
}
