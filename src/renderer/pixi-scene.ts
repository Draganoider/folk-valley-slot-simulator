import { Application, Container, Graphics, Text } from 'pixi.js';
import type { SceneFrame } from './frame';
import { placeholderFor, WILD_REEL } from './placeholder-symbols';
import type { Scene, SceneSnapshot, ShowOptions } from './scene';

/**
 * The reel scene in PixiJS 8 (DR-007), with placeholder art: a 5×3 grid of coloured, labelled
 * cells, a caption, and a Scar Card meter. Showing a frame stops the reels left to right,
 * turns a landing's reels wild, then outlines the winning positions and moves the meter.
 *
 * The scene only draws what the frame says. Its pauses are plain timers that the presentation
 * timeline will replace; under reduced motion it draws the end state at once.
 */

const WIDTH = 960;
const HEIGHT = 600;
const REELS = 5;
const ROWS = 3;
const CELL_W = 152;
const CELL_H = 136;
const GAP = 12;
const GRID_X = (WIDTH - (REELS * CELL_W + (REELS - 1) * GAP)) / 2;
const GRID_Y = 72;
const METER_Y = GRID_Y + ROWS * CELL_H + (ROWS - 1) * GAP + 36;

const BACKGROUND = 0x1f2a24;
const SPINNING = 0x2f3b35;
const HIGHLIGHT = 0xffffff;
const MARK_EMPTY = 0x374151;
const MARK_FULL = 0xef4444;

const PAUSE_BEFORE_STOPS = 160;
const PAUSE_PER_REEL = 130;
const PAUSE_AFTER_WILD = 320;

interface Cell {
  readonly box: Graphics;
  readonly label: Text;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PixiScene implements Scene {
  private readonly cells: Cell[][] = [];
  private readonly caption: Text;
  private readonly meterLabel: Text;
  private readonly meter: Graphics;
  private frame: SceneFrame | null = null;
  private phase: SceneSnapshot['phase'] = 'idle';
  private reelsStopped = 0;
  private wildShown = false;
  private winsShown = false;
  private meterMarks = 0;
  private meterSize = 0;
  private showToken = 0;

  private constructor(private readonly app: Application) {
    const stage = app.stage;
    this.caption = new Text({ text: 'Press Spin to play', style: { fill: 0xf9fafb, fontSize: 26, fontFamily: 'system-ui, sans-serif', fontWeight: '600' } });
    this.caption.anchor.set(0.5, 0);
    this.caption.position.set(WIDTH / 2, 20);
    stage.addChild(this.caption);

    for (let reel = 0; reel < REELS; reel++) {
      const column: Cell[] = [];
      for (let row = 0; row < ROWS; row++) {
        const container = new Container();
        container.position.set(GRID_X + reel * (CELL_W + GAP), GRID_Y + row * (CELL_H + GAP));
        const box = new Graphics();
        const label = new Text({ text: '', style: { fill: 0xf9fafb, fontSize: 24, fontFamily: 'system-ui, sans-serif', fontWeight: '700' } });
        label.anchor.set(0.5);
        label.position.set(CELL_W / 2, CELL_H / 2);
        container.addChild(box, label);
        stage.addChild(container);
        column.push({ box, label });
      }
      this.cells.push(column);
    }

    this.meterLabel = new Text({ text: '', style: { fill: 0xf9fafb, fontSize: 20, fontFamily: 'system-ui, sans-serif' } });
    this.meterLabel.position.set(GRID_X, METER_Y);
    this.meter = new Graphics();
    this.meter.position.set(GRID_X + 230, METER_Y);
    stage.addChild(this.meterLabel, this.meter);
    this.draw();
  }

  /** Starts Pixi in `host`. Rejects when the browser cannot give it a WebGL context. */
  static async create(host: HTMLElement): Promise<PixiScene> {
    const app = new Application();
    await app.init({
      width: WIDTH,
      height: HEIGHT,
      background: BACKGROUND,
      preference: 'webgl',
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      autoDensity: false,
      antialias: true,
    });
    const canvas = app.canvas;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.classList.add('scene-canvas');
    host.appendChild(canvas);
    return new PixiScene(app);
  }

  async show(frame: SceneFrame, options: ShowOptions): Promise<void> {
    const token = ++this.showToken;
    const pause = (ms: number): Promise<void> => (options.reducedMotion ? Promise.resolve() : delay(ms));
    this.frame = frame;
    this.phase = 'stopping';
    this.reelsStopped = 0;
    this.wildShown = false;
    this.winsShown = false;
    this.setScarCard(frame.scarCard.before, frame.scarCard.size);
    this.draw();

    await pause(PAUSE_BEFORE_STOPS);
    for (let reel = 0; reel < REELS; reel++) {
      if (token !== this.showToken) return;
      this.reelsStopped = reel + 1;
      this.draw();
      await pause(PAUSE_PER_REEL);
    }
    if (token !== this.showToken) return;
    if (frame.wildReels.length > 0) {
      this.wildShown = true;
      this.draw();
      await pause(PAUSE_AFTER_WILD);
      if (token !== this.showToken) return;
    }
    this.wildShown = true;
    this.winsShown = true;
    this.phase = 'shown';
    this.setScarCard(frame.scarCard.after, frame.scarCard.size);
    this.draw();
  }

  setScarCard(marks: number, size: number): void {
    this.meterMarks = marks;
    this.meterSize = size;
    this.drawMeter();
  }

  snapshot(): SceneSnapshot {
    return { phase: this.phase, reelsStopped: this.reelsStopped, frame: this.frame, renderer: 'pixi' };
  }

  destroy(): void {
    this.showToken++;
    this.app.destroy(true, { children: true });
  }

  private draw(): void {
    const frame = this.frame;
    this.caption.text = frame?.caption ?? 'Press Spin to play';
    const highlighted = new Set((this.winsShown ? frame?.highlights ?? [] : []).map((p) => `${p.reel},${p.row}`));
    const anyWin = highlighted.size > 0;
    for (let reel = 0; reel < REELS; reel++) {
      for (let row = 0; row < ROWS; row++) {
        const cell = this.cells[reel]![row]!;
        const symbol = frame?.grid[reel]?.[row];
        const stopped = frame !== null && reel < this.reelsStopped && symbol !== undefined;
        const wild = stopped && this.wildShown && frame.wildReels.includes(reel);
        const look = !stopped ? null : wild ? WILD_REEL : placeholderFor(symbol);
        const lit = highlighted.has(`${reel},${row}`);
        const kicker = stopped && frame.kicker !== null && frame.kicker.reel === reel && frame.kicker.row === row;

        cell.box.clear();
        cell.box.roundRect(0, 0, CELL_W, CELL_H, 14).fill({ color: look?.fill ?? SPINNING, alpha: anyWin && !lit ? 0.35 : 1 });
        if (lit) cell.box.roundRect(3, 3, CELL_W - 6, CELL_H - 6, 12).stroke({ width: 6, color: HIGHLIGHT });
        else if (kicker) cell.box.roundRect(3, 3, CELL_W - 6, CELL_H - 6, 12).stroke({ width: 4, color: 0xfacc15 });
        cell.label.text = look?.label ?? '';
        cell.label.style.fill = look?.text ?? 0xf9fafb;
        cell.label.alpha = anyWin && !lit ? 0.5 : 1;
      }
    }
  }

  private drawMeter(): void {
    this.meterLabel.text = `SCAR CARD ${this.meterMarks}/${this.meterSize}`;
    const g = this.meter;
    g.clear();
    for (let i = 0; i < this.meterSize; i++) {
      g.roundRect(i * 34, 0, 28, 28, 6).fill(i < this.meterMarks ? MARK_FULL : MARK_EMPTY);
    }
  }
}
