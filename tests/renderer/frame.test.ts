import { describe, expect, it } from 'vitest';
import { FOLK_VALLEY_CONFIG, initialPlayerState, spin, type SpinResult } from '../../src/engine';
import { baseFrame, framesOf, sessionFrame } from '../../src/renderer/frame';

const CONFIG = FOLK_VALLEY_CONFIG;
const SEED = '00000000c0ffee00';

/** The first of the first few thousand spins that matches. */
function find(wanted: (r: SpinResult) => boolean): SpinResult {
  const state = initialPlayerState(CONFIG);
  for (let i = 0; i < 20_000; i++) {
    const { result } = spin(CONFIG, state, { masterSeed: SEED, spinIndex: i, betLevel: 1 });
    if (wanted(result)) return result;
  }
  throw new Error('no spin matched');
}

describe('scene frames', () => {
  it('copy the base grid, stops and win positions without changing the result', () => {
    const result = find((r) => r.base.wins.length > 1);
    const before = structuredClone(result);
    const frame = baseFrame(result);
    expect(frame.grid).toEqual(result.base.grid);
    expect(frame.stops).toEqual(result.base.stops);
    const keys = new Set(result.base.wins.flatMap((w) => w.positions.map((p) => `${p.reel},${p.row}`)));
    expect(frame.highlights.map((p) => `${p.reel},${p.row}`).sort()).toEqual([...keys].sort());
    expect(result).toEqual(before);
  });

  it('turn reels wild only for a landing', () => {
    const landed = find((r) => r.base.attempt?.outcome === 'landed');
    expect(baseFrame(landed).wildReels).toEqual(landed.base.attempt!.wildReels);
    expect(baseFrame(landed).kicker).toEqual(landed.base.attempt!.kicker);
    const bailed = find((r) => r.base.attempt?.outcome === 'bailed');
    expect(baseFrame(bailed).wildReels).toEqual([]);
    expect(baseFrame(bailed).scarCard).toEqual({ size: CONFIG.scarCard.size, before: bailed.scarCard.before, after: bailed.scarCard.after });
  });

  it('give one frame per free spin, with the ladder in the caption', () => {
    const result = find((r) => r.session !== null && r.session.spins.length > 0);
    const frames = framesOf(result);
    expect(frames).toHaveLength(1 + result.session!.spins.length);
    const first = result.session!.spins[0]!;
    expect(frames[1]!.stops).toEqual(first.stops);
    expect(frames[1]!.caption).toContain(`×${first.ladderAfter.multiplier}`);
    expect(() => sessionFrame(result, result.session!.spins.length)).toThrow(RangeError);
  });
});
