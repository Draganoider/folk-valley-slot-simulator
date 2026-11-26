import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_CONFIG,
  createRng,
  drawStops,
  gridFromStops,
  initialPlayerState,
  parseSeed,
  scarCardMarks,
  withScarCardMarks,
} from '../../src/engine';

describe('player state', () => {
  it('starts with an empty card at every bet level', () => {
    const state = initialPlayerState(PLACEHOLDER_CONFIG);
    for (const level of PLACEHOLDER_CONFIG.bet.levels) {
      expect(scarCardMarks(PLACEHOLDER_CONFIG, state, level)).toBe(0);
    }
  });

  it('keeps each bet level on its own card', () => {
    const before = initialPlayerState(PLACEHOLDER_CONFIG);
    const after = withScarCardMarks(before, 5, 3);
    expect(scarCardMarks(PLACEHOLDER_CONFIG, after, 5)).toBe(3);
    expect(scarCardMarks(PLACEHOLDER_CONFIG, after, 1)).toBe(0);
    expect(scarCardMarks(PLACEHOLDER_CONFIG, before, 5)).toBe(0); // not mutated
    expect(JSON.parse(JSON.stringify(after))).toEqual(after);
  });

  it('refuses a bet level the configuration does not offer, or an impossible card', () => {
    const state = initialPlayerState(PLACEHOLDER_CONFIG);
    expect(() => scarCardMarks(PLACEHOLDER_CONFIG, state, 3)).toThrow(RangeError);
    const full = withScarCardMarks(state, 1, PLACEHOLDER_CONFIG.scarCard.size);
    expect(() => scarCardMarks(PLACEHOLDER_CONFIG, full, 1)).toThrow(RangeError);
  });
});

describe('grid', () => {
  const strips = [
    ['a', 'b', 'c', 'd'],
    ['e', 'f', 'g'],
  ];

  it('shows consecutive stops from the top, wrapping', () => {
    expect(gridFromStops(strips, [0, 0], 3)).toEqual([
      ['a', 'b', 'c'],
      ['e', 'f', 'g'],
    ]);
    expect(gridFromStops(strips, [3, 2], 3)).toEqual([
      ['d', 'a', 'b'],
      ['g', 'e', 'f'],
    ]);
  });

  it('refuses stops outside a strip', () => {
    expect(() => gridFromStops(strips, [4, 0], 3)).toThrow(RangeError);
    expect(() => gridFromStops(strips, [0], 3)).toThrow(RangeError);
  });

  it('draws one stop per reel in reel order, reproducibly', () => {
    const seed = parseSeed('0123456789abcdef');
    const stops = drawStops(createRng(seed), PLACEHOLDER_CONFIG.reels);
    const rng = createRng(seed);
    expect(stops).toEqual(PLACEHOLDER_CONFIG.reels.map((s) => rng.nextInt(s.length)));
    stops.forEach((stop, i) => expect(stop).toBeLessThan((PLACEHOLDER_CONFIG.reels[i] as readonly string[]).length));
  });
});
