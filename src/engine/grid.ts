import type { ReelStrip } from './config';
import type { Rng } from './rng';
import type { Grid } from './result';

/**
 * Reel stops and the grid they show. A stop is the strip index at the top row; the window
 * shows `rows` consecutive symbols from there, wrapping round the end of the strip.
 */

/** Draws one stop per reel, reel 1 first, each uniform over its strip: one `nextInt` per reel. */
export function drawStops(rng: Rng, strips: readonly ReelStrip[]): number[] {
  return strips.map((strip) => rng.nextInt(strip.length));
}

/** The visible grid, `grid[reel][row]`, for the given stops. */
export function gridFromStops(strips: readonly ReelStrip[], stops: readonly number[], rows: number): Grid {
  if (stops.length !== strips.length) {
    throw new RangeError(`Need one stop per reel: ${strips.length}; got ${stops.length}.`);
  }
  return strips.map((strip, reel) => {
    const stop = stops[reel] as number;
    if (!Number.isInteger(stop) || stop < 0 || stop >= strip.length) {
      throw new RangeError(`Stop ${stop} is outside reel ${reel + 1}, which has ${strip.length} stops.`);
    }
    return Array.from({ length: rows }, (_, row) => strip[(stop + row) % strip.length] as string);
  });
}
