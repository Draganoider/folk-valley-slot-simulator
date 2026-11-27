import { Application, Container, Graphics, Text } from 'pixi.js';
import { PlaceholderCard, type CardLayer } from './placeholder-card';
import { PlaceholderRider, type RiderLayer } from './placeholder-rider';
import { placeholderFor, SPIN_CYCLE, WILD_REEL } from './placeholder-symbols';
import { SceneRecorder, type Scene, type SceneSnapshot } from './scene';
import { SPIN_PERIOD, type SceneView } from './view';

/**
 * The reel scene in PixiJS 8 (DR-007), with placeholder art. It draws one `SceneView` per
 * frame and keeps no timers or tweens: every position, fade and flash comes from the view,
 * which is a pure function of the timeline and the time. So the presentation player owns
 * time, and turbo, skip and seek are exact.
 *
 * Layers, back to front: the 5×3 grid, the rider lane (`RiderLayer`), the cut-away flash,
 * the information card (`CardLayer`), then the caption, Session bar, win line and meters.
 * The rider and the card are the milestone 4 seams (DR-015): rig clips and painted held
 * frames replace the placeholder layers without touching the rest.
 */

const WIDTH = 960;
const HEIGHT = 600;
const REELS = 5;
const ROWS = 3;
const CELL_W = 152;
const CELL_H = 136;
const GAP = 12;
const GRID_W = REELS * CELL_W + (REELS - 1) * GAP;
const GRID_X = (WIDTH - GRID_W) / 2;
const GRID_Y = 72;
const GRID_BOTTOM = GRID_Y + ROWS * CELL_H + (ROWS - 1) * GAP;
const METER_Y = GRID_BOTTOM + 44;
const SETTLE_DROP = 22;

const BACKGROUND = 0x1f2a24;
const SPINNING = 0x2f3b35;
const HIGHLIGHT = 0xffffff;
const KICKER_EDGE = 0xfacc15;
const MARK_EMPTY = 0x374151;
const MARK_FULL = 0xef4444;
const FONT = 'system-ui, sans-serif';

interface Cell {
  readonly root: Container;
  readonly box: Graphics;
  readonly label: Text;
}

export class PixiScene implements Scene {
  private readonly cells: Cell[][] = [];
  private readonly columns: Container[] = [];
  private readonly grid = new Container();
  private readonly rider: RiderLayer;
  private readonly flash = new Graphics();
  private readonly card: CardLayer;
  private readonly caption: Text;
  private readonly sessionBar: Text;
  private readonly winLine: Text;
  private readonly winMeter: Text;
  private readonly meterLabel: Text;
  private readonly meter: Graphics;
  private readonly recorder = new SceneRecorder();
  private meterMarks = 0;
  private meterSize = 0;
  private meterPulse = false;

  private constructor(private readonly app: Application) {
    const stage = app.stage;
    stage.addChild(this.grid);
    for (let reel = 0; reel < REELS; reel++) {
      const column = new Container();
      column.position.set(GRID_X + reel * (CELL_W + GAP), GRID_Y);
      const cells: Cell[] = [];
      for (let row = 0; row < ROWS; row++) {
        const root = new Container();
        root.position.set(0, row * (CELL_H + GAP));
        const box = new Graphics();
        const label = new Text({ text: '', style: { fill: 0xf9fafb, fontSize: 24, fontFamily: FONT, fontWeight: '700' } });
        label.anchor.set(0.5);
        label.position.set(CELL_W / 2, CELL_H / 2);
        root.addChild(box, label);
        column.addChild(root);
        cells.push({ root, box, label });
      }
      this.grid.addChild(column);
      this.columns.push(column);
      this.cells.push(cells);
    }

    this.rider = new PlaceholderRider({ left: GRID_X, right: GRID_X + GRID_W, ground: GRID_BOTTOM - 14, jump: 240 });
    this.card = new PlaceholderCard(WIDTH, HEIGHT);
    stage.addChild(this.rider.container, this.flash, this.card.container);

    this.caption = new Text({ text: 'Press Spin to play', style: { fill: 0xf9fafb, fontSize: 26, fontFamily: FONT, fontWeight: '600' } });
    this.caption.position.set(GRID_X, 20);
    this.sessionBar = new Text({ text: '', style: { fill: 0x5eead4, fontSize: 18, fontFamily: FONT, fontWeight: '700' } });
    this.sessionBar.anchor.set(1, 0);
    this.sessionBar.position.set(WIDTH - GRID_X, 26);
    this.winLine = new Text({ text: '', style: { fill: 0xfde047, fontSize: 22, fontFamily: FONT, fontWeight: '700', stroke: { color: 0x111827, width: 4 } } });
    this.winLine.anchor.set(0.5, 0);
    this.winLine.position.set(WIDTH / 2, GRID_BOTTOM + 6);
    this.winMeter = new Text({ text: '', style: { fill: 0xfde047, fontSize: 30, fontFamily: FONT, fontWeight: '800' } });
    this.winMeter.anchor.set(1, 0);
    this.winMeter.position.set(WIDTH - GRID_X, GRID_BOTTOM + 2);
    this.meterLabel = new Text({ text: '', style: { fill: 0xf9fafb, fontSize: 20, fontFamily: FONT } });
    this.meterLabel.position.set(GRID_X, METER_Y);
    this.meter = new Graphics();
    this.meter.position.set(GRID_X + 230, METER_Y);
    stage.addChild(this.caption, this.sessionBar, this.winLine, this.winMeter, this.meterLabel, this.meter);

    this.drawIdle();
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

  begin(): void {
    this.recorder.begin();
  }

  render(view: SceneView): void {
    this.recorder.record(view);
    this.caption.text = view.caption;
    this.drawReels(view);
    this.rider.draw(view.rider);
    this.flash.clear();
    if (view.flash > 0) this.flash.rect(0, 0, WIDTH, HEIGHT).fill({ color: 0xffffff, alpha: view.flash });
    this.card.draw(view.card);

    const s = view.session;
    this.sessionBar.text =
      s === null ? '' : `SESSION ×${s.ladder.multiplier} · rung ${s.ladder.rung} · pain ${s.ladder.pain} · ${s.ended ? 'over' : `${s.spinsLeft} left`}`;
    this.winLine.text = view.winLabel ?? '';
    this.winMeter.text = view.countingUp || view.winCredits > 0 ? `WIN ${view.winCredits.toLocaleString('en-US')}` : '';
    this.meterMarks = view.scarCard.marks;
    this.meterSize = view.scarCard.size;
    this.meterPulse = view.scarCard.change !== null;
    this.drawMeter();
    // Pixi's own ticker renders on the next animation frame; nothing here waits for it.
  }

  setScarCard(marks: number, size: number): void {
    this.meterMarks = marks;
    this.meterSize = size;
    this.meterPulse = false;
    this.drawMeter();
  }

  snapshot(): SceneSnapshot {
    return this.recorder.snapshot('pixi');
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }

  private drawIdle(): void {
    for (const column of this.cells) {
      for (const cell of column) {
        cell.box.clear();
        cell.box.roundRect(0, 0, CELL_W, CELL_H, 14).fill(SPINNING);
        cell.label.text = '';
      }
    }
    this.rider.draw(null);
    this.card.draw(null);
    this.drawMeter();
  }

  private drawReels(view: SceneView): void {
    const lit = new Set(view.highlights.map((p) => `${p.reel},${p.row}`));
    const anyWin = lit.size > 0;
    const dim = view.rider !== null ? 0.55 : 1;
    this.grid.alpha = dim;
    for (let reel = 0; reel < REELS; reel++) {
      const reelView = view.reels[reel];
      const column = this.columns[reel]!;
      column.y = GRID_Y - (reelView?.settle ?? 0) * SETTLE_DROP;
      for (let row = 0; row < ROWS; row++) {
        const cell = this.cells[reel]![row]!;
        const symbol = reelView?.symbols?.[row];
        cell.box.clear();
        if (reelView === undefined || symbol === undefined) {
          // Spinning: a blurred column of labels scrolling by the view's offset.
          const offset = reelView?.spinOffset ?? 0;
          const cycle = SPIN_CYCLE[(row + reel * 2 + Math.floor((view.time / SPIN_PERIOD) % SPIN_CYCLE.length)) % SPIN_CYCLE.length]!;
          cell.box.roundRect(0, 0, CELL_W, CELL_H, 14).fill(SPINNING);
          cell.label.text = offset === 0 && view.reduced ? '' : cycle;
          cell.label.style.fill = 0x9ca3af;
          cell.label.alpha = 0.45;
          cell.label.y = CELL_H / 2 + (offset - 0.5) * CELL_H * 0.7;
          continue;
        }
        const look = reelView.wild ? WILD_REEL : placeholderFor(symbol);
        const on = lit.has(`${reel},${row}`);
        const kicker = view.kicker !== null && view.kicker.reel === reel && view.kicker.row === row && !reelView.wild;
        cell.box.roundRect(0, 0, CELL_W, CELL_H, 14).fill({ color: look.fill, alpha: anyWin && !on ? 0.35 : 1 });
        if (on) cell.box.roundRect(3, 3, CELL_W - 6, CELL_H - 6, 12).stroke({ width: 6, color: HIGHLIGHT });
        else if (kicker) cell.box.roundRect(3, 3, CELL_W - 6, CELL_H - 6, 12).stroke({ width: 4, color: KICKER_EDGE });
        cell.label.text = look.label;
        cell.label.style.fill = look.text;
        cell.label.alpha = anyWin && !on ? 0.5 : 1;
        cell.label.y = CELL_H / 2;
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
    if (this.meterPulse) g.roundRect(-6, -6, this.meterSize * 34 + 6, 40, 10).stroke({ width: 3, color: 0xfde047 });
  }
}
