/**
 * Placeholder art: a colour and a text label per symbol. No generated art is used until
 * milestone 4; these stand in so the scene's layout and highlighting can be built and
 * tested first.
 */
export interface PlaceholderSymbol {
  readonly label: string;
  readonly fill: number;
  readonly text: number;
}

const DARK = 0x111827;
const LIGHT = 0xf9fafb;

const SYMBOLS: { readonly [id: string]: PlaceholderSymbol } = {
  gramps: { label: 'GRAMPS', fill: 0xc2410c, text: LIGHT },
  kerb: { label: 'KERB', fill: 0x1d4ed8, text: LIGHT },
  zip: { label: 'ZIP', fill: 0x7e22ce, text: LIGHT },
  dot: { label: 'DOT', fill: 0xbe185d, text: LIGHT },
  helmet: { label: 'HELMET', fill: 0x4d7c0f, text: LIGHT },
  deck: { label: 'DECK', fill: 0x15803d, text: LIGHT },
  pegs: { label: 'PEGS', fill: 0x0e7490, text: LIGHT },
  bars: { label: 'BARS', fill: 0x0369a1, text: LIGHT },
  bolt: { label: 'BOLT', fill: 0x78716c, text: LIGHT },
  wrench: { label: 'WRENCH', fill: 0x57534e, text: LIGHT },
  'grip-tape': { label: 'GRIP', fill: 0x44403c, text: LIGHT },
  cone: { label: 'CONE', fill: 0xa16207, text: LIGHT },
  sticker: { label: 'STICKER', fill: 0x9f1239, text: LIGHT },
  kicker: { label: 'KICKER', fill: 0xfacc15, text: DARK },
  flyer: { label: 'FLYER', fill: 0x14b8a6, text: DARK },
};

export function placeholderFor(symbol: string): PlaceholderSymbol {
  return SYMBOLS[symbol] ?? { label: symbol.toUpperCase(), fill: 0x374151, text: LIGHT };
}

/** A reel a landing turned wild. */
export const WILD_REEL: PlaceholderSymbol = { label: 'WILD', fill: 0xfde047, text: DARK };

/** The labels a spinning reel scrolls through: a blur, not the strip, so nothing is implied about the stop. */
export const SPIN_CYCLE: readonly string[] = ['GRAMPS', 'BOLT', 'KERB', 'CONE', 'ZIP', 'PEGS', 'DOT', 'GRIP'];
