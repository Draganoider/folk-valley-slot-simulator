import type { Grid, Position, SpinResult } from '../engine';

/**
 * What the reel scene draws for one grid: the paid spin's base grid, or one free spin of its
 * Session. Plain data read from a finished `SpinResult` (rule 4); the scene never sees the
 * result itself, so its input stays narrow enough for the presentation timeline to drive
 * later.
 */
export interface SceneFrame {
  /** "base" for the paid spin's grid, or the free spin's 0-based index in its Session. */
  readonly step: 'base' | number;
  /** `grid[reel][row]`, as the reels stopped. */
  readonly grid: Grid;
  readonly stops: readonly number[];
  /** The Kicker a trick was launched from, if any. */
  readonly kicker: Position | null;
  /** Reels a landing turned wild, the Kicker's own first. */
  readonly wildReels: readonly number[];
  /** Every position taking part in a win, each once. */
  readonly highlights: readonly Position[];
  readonly flyers: readonly Position[];
  /** The Scar Card meter before and after this grid. */
  readonly scarCard: { readonly size: number; readonly before: number; readonly after: number };
  /** A short label drawn above the grid. */
  readonly caption: string;
}

function uniquePositions(lists: readonly (readonly Position[])[]): Position[] {
  const seen = new Set<string>();
  const out: Position[] = [];
  for (const list of lists) {
    for (const p of list) {
      const key = `${p.reel},${p.row}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(p);
      }
    }
  }
  return out;
}

function flyerPositions(grid: Grid): Position[] {
  const out: Position[] = [];
  grid.forEach((column, reel) =>
    column.forEach((symbol, row) => {
      if (symbol === 'flyer') out.push({ reel, row });
    }),
  );
  return out;
}

export function baseFrame(result: SpinResult): SceneFrame {
  const { base, scarCard } = result;
  const attempt = base.attempt;
  const landed = attempt?.outcome === 'landed';
  return {
    step: 'base',
    grid: base.grid,
    stops: base.stops,
    kicker: attempt?.kicker ?? null,
    wildReels: landed ? attempt.wildReels : [],
    highlights: uniquePositions(base.wins.map((w) => w.positions)),
    flyers: base.flyers.positions,
    scarCard: { size: scarCard.size, before: scarCard.before, after: scarCard.after },
    caption: attempt === null ? 'Paid spin' : `Paid spin: trick ${attempt.outcome}`,
  };
}

/** The frame of free spin `index` of the result's Session. Throws if there is no such spin. */
export function sessionFrame(result: SpinResult, index: number): SceneFrame {
  const spin = result.session?.spins[index];
  if (spin === undefined) throw new RangeError(`The result has no free spin ${index}.`);
  const card = result.scarCard.after;
  const ladder = spin.ladderAfter;
  return {
    step: index,
    grid: spin.grid,
    stops: spin.stops,
    kicker: null,
    wildReels: [],
    highlights: uniquePositions(spin.wins.map((w) => w.positions)),
    flyers: flyerPositions(spin.grid),
    scarCard: { size: result.scarCard.size, before: card, after: card },
    caption: `Free spin ${index + 1}: ×${ladder.multiplier}, rung ${ladder.rung}, pain ${ladder.pain}`,
  };
}

/** Every frame the result shows, in order: the base grid, then each free spin. */
export function framesOf(result: SpinResult): SceneFrame[] {
  const frames = [baseFrame(result)];
  result.session?.spins.forEach((_, i) => frames.push(sessionFrame(result, i)));
  return frames;
}
