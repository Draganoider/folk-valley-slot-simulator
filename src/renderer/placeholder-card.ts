import { Container, Graphics, Text } from 'pixi.js';
import type { CardTone, CardView } from './view';

/**
 * Draws the information card for one moment: the injury, the patch-up, the Scar Card,
 * the Session's beats and the closing card. The placeholder is a labelled panel; in
 * milestone 4 DR-015's painted held frames replace the panel for every card with a
 * `heldFrame`, keyed by its rider, level, injury and `bloodHidden`, under the same interface.
 */
export interface CardLayer {
  readonly container: Container;
  draw(view: CardView | null): void;
}

const TONE: { readonly [T in CardTone]: { fill: number; edge: number } } = {
  neutral: { fill: 0x111827, edge: 0x9ca3af },
  good: { fill: 0x064e3b, edge: 0x34d399 },
  bad: { fill: 0x451a03, edge: 0xf59e0b },
  hurt: { fill: 0x3f1d1d, edge: 0xfca5a5 },
};

const W = 560;
const H = 300;

export class PlaceholderCard implements CardLayer {
  readonly container = new Container();
  private readonly shade = new Graphics();
  private readonly panel = new Graphics();
  private readonly title: Text;
  private readonly lines: Text;
  private readonly tag: Text;

  constructor(private readonly width: number, private readonly height: number) {
    const font = 'system-ui, sans-serif';
    this.title = new Text({ text: '', style: { fill: 0xf9fafb, fontSize: 46, fontFamily: font, fontWeight: '800' } });
    this.lines = new Text({ text: '', style: { fill: 0xe5e7eb, fontSize: 24, fontFamily: font, align: 'center', lineHeight: 34 } });
    this.tag = new Text({ text: '', style: { fill: 0xf9fafb, fontSize: 18, fontFamily: font, fontWeight: '700' } });
    this.title.anchor.set(0.5, 0);
    this.lines.anchor.set(0.5, 0);
    this.tag.anchor.set(0.5, 0);
    this.container.addChild(this.shade, this.panel, this.title, this.lines, this.tag);
  }

  draw(view: CardView | null): void {
    this.container.visible = view !== null;
    if (view === null) return;
    const cx = this.width / 2;
    const top = (this.height - H) / 2 - 20;
    const left = cx - W / 2;
    const tone = TONE[view.tone];
    this.container.alpha = view.alpha;

    this.shade.clear();
    this.shade.rect(0, 0, this.width, this.height).fill({ color: 0x000000, alpha: 0.55 });

    const g = this.panel;
    g.clear();
    if (view.friendFilming) {
      // A phone held up by a friend filming the patched-up rider (DR-010).
      g.roundRect(left - 26, top - 30, W + 52, H + 70, 36).fill(0x0b0b0b).stroke({ width: 4, color: 0x6b7280 });
      g.circle(left + 4, top - 10, 7).fill(0xef4444);
    }
    g.roundRect(left, top, W, H, 22).fill(tone.fill).stroke({ width: 5, color: tone.edge });

    // Placeholder marks for the held frame's content, never drawn with blood under Mild.
    if (view.level === 'bleeding' && !view.bloodHidden) {
      g.circle(left + 60, top + 70, 14).fill(0xb91c1c);
      g.poly([left + 46, top + 66, left + 60, top + 40, left + 74, top + 66]).fill(0xb91c1c);
    }
    if (view.level === 'broken') {
      g.poly([left + 40, top + 90, left + 70, top + 50, left + 84, top + 74, left + 110, top + 40]).stroke({ width: 8, color: 0xf5f5f4 });
    }
    if (view.level === 'patched-up') {
      g.roundRect(left + 40, top + 52, 60, 22, 6).fill(0xf5f5f4);
      g.rect(left + 64, top + 46, 12, 34).fill(0xf5f5f4);
    }

    this.title.text = view.title;
    this.title.position.set(cx, top + 34);
    this.lines.text = view.lines.join('\n');
    this.lines.position.set(cx, top + 104);
    this.tag.text = view.friendFilming ? '● REC  ·  friend filming' : '';
    this.tag.position.set(cx, top + H + 6);
  }
}
