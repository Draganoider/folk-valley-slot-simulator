import { Container, Graphics, Text } from 'pixi.js';
import type { RiderId } from '../engine';
import type { RiderView } from './view';

/**
 * Draws the rider for one moment. The placeholder below is a box-and-circle figure on a
 * line; DR-015's cut-out rig replaces it in milestone 4 by implementing the same interface
 * and playing `view.clip` (the clip id and its progress) instead of moving shapes.
 */
export interface RiderLayer {
  readonly container: Container;
  draw(view: RiderView | null): void;
}

export interface Lane {
  /** Stage x of the lane's left and right ends. */
  readonly left: number;
  readonly right: number;
  /** Stage y of the ground. */
  readonly ground: number;
  /** Pixels at the top of a jump. */
  readonly jump: number;
}

const RIDER_COLOUR: { readonly [R in RiderId]: number } = {
  gramps: 0xc2410c,
  kerb: 0x1d4ed8,
  zip: 0x7e22ce,
  dot: 0xbe185d,
};

export class PlaceholderRider implements RiderLayer {
  readonly container = new Container();
  private readonly track = new Graphics();
  private readonly figure = new Container();
  private readonly body = new Graphics();
  private readonly label: Text;

  constructor(private readonly lane: Lane) {
    this.label = new Text({ text: '', style: { fill: 0xfde047, fontSize: 26, fontFamily: 'system-ui, sans-serif', fontWeight: '800', stroke: { color: 0x111827, width: 5 } } });
    this.label.anchor.set(0.5, 1);
    this.figure.addChild(this.body);
    this.container.addChild(this.track, this.figure, this.label);
  }

  draw(view: RiderView | null): void {
    this.container.visible = view !== null;
    if (view === null) return;
    const { left, right, ground, jump } = this.lane;
    const span = right - left;
    const rampX = left + view.rampX * span;

    this.track.clear();
    this.track.rect(left - 40, ground, span + 80, 6).fill({ color: 0xf9fafb, alpha: 0.8 });
    this.track.poly([rampX - 70, ground, rampX, ground - 46, rampX, ground]).fill({ color: 0xfacc15, alpha: 0.9 });

    const x = left + view.x * span;
    const y = ground - view.lift * jump;
    this.figure.position.set(x, y);
    this.figure.rotation = view.rotation;
    this.figure.alpha = view.alpha;

    const g = this.body;
    g.clear();
    const colour = RIDER_COLOUR[view.rider] ?? 0x9ca3af;
    // Wheels or deck, body, head: about 90 px tall, pivoting at the feet.
    g.roundRect(-34, -12, 68, 10, 4).fill(0x111827);
    g.circle(-24, -2, 8).fill(0x374151);
    g.circle(24, -2, 8).fill(0x374151);
    g.roundRect(-14, -68, 28, 54, 8).fill(colour);
    g.circle(0, -82, 15).fill(0xf5d0a9);
    g.roundRect(-16, -100, 32, 14, 6).fill(0x111827);

    this.label.text = view.label;
    this.label.position.set(Math.min(right, Math.max(left, x)), y - 112);
    this.label.alpha = view.alpha;
  }
}
