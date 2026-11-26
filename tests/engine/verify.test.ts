import { describe, expect, it } from 'vitest';
import { assertWithinTolerance, bernoulliSigma, checkSeedSweep, checkTolerance } from '../../src/engine';
import type { ObservedFigure, Theoretical } from '../../src/engine';

const theo = (value: number): Theoretical<number> => ({ kind: 'theoretical', value });
const obs = (value: number): ObservedFigure<number> => ({ kind: 'observed', value, theoretical: null });

describe('checkTolerance (DR-006: |obs − theo| ≤ 4·σ/√N)', () => {
  it('computes the standard error, tolerance and z-score by hand', () => {
    // σ 6 over 10⁶ spins: SE 0.006, tolerance 0.024.
    const c = checkTolerance({ observed: obs(0.97), theoretical: theo(0.96), sigma: theo(6), n: 1_000_000 });
    expect(c.standardError).toBeCloseTo(0.006, 15);
    expect(c.tolerance).toBeCloseTo(0.024, 15);
    expect(c.difference).toBeCloseTo(0.01, 15);
    expect(c.zScore).toBeCloseTo(0.01 / 0.006, 12);
    expect(c.k).toBe(4);
    expect(c.pass).toBe(true);
  });

  it('passes just inside the edge and fails just past it', () => {
    const base = { theoretical: theo(0.5), sigma: theo(1), n: 10_000 }; // SE 0.01
    expect(checkTolerance({ ...base, observed: 0.5399 }).pass).toBe(true);
    expect(checkTolerance({ ...base, observed: 0.4601 }).pass).toBe(true);
    expect(checkTolerance({ ...base, observed: 0.5401 }).pass).toBe(false);
    expect(checkTolerance({ ...base, observed: 0.52, k: 1 }).pass).toBe(false);
  });

  it('assertWithinTolerance throws with the numbers', () => {
    expect(() =>
      assertWithinTolerance({ observed: 0.9, theoretical: theo(0.96), sigma: theo(6), n: 10_000_000 }, 'RTP'),
    ).toThrow(/Observed RTP 0\.9 is -31\.6\d standard errors/);
    expect(assertWithinTolerance({ observed: 0.96, theoretical: theo(0.96), sigma: theo(6), n: 10 }).pass).toBe(true);
  });

  it('takes only labelled theoretical values, never a simulated stand-in', () => {
    const sneaky = { kind: 'observed', value: 6 } as unknown as Theoretical<number>;
    expect(() => checkTolerance({ observed: 1, theoretical: theo(1), sigma: sneaky, n: 10 })).toThrow(/theoretical/);
    expect(() => checkTolerance({ observed: 1, theoretical: sneaky, sigma: theo(1), n: 10 })).toThrow(/theoretical/);
    const notObserved = { kind: 'theoretical', value: 1, theoretical: null } as unknown as ObservedFigure<number>;
    expect(() => checkTolerance({ observed: notObserved, theoretical: theo(1), sigma: theo(1), n: 10 })).toThrow(/observed/);
    expect(() => checkTolerance({ observed: 1, theoretical: theo(1), sigma: theo(1), n: 0 })).toThrow(/n/);
  });

  it('bernoulliSigma gives √(p(1 − p)) for checking a rate', () => {
    expect(bernoulliSigma(theo(0.3))).toEqual({ kind: 'theoretical', value: Math.sqrt(0.21) });
    expect(() => bernoulliSigma(theo(1.2))).toThrow(/probability/);
  });
});

describe('checkSeedSweep', () => {
  it('passes z-scores that look standard normal', () => {
    const zs = [-1.2, 0.3, 0.8, -0.5, 1.6, -0.9, 0.1, 0.4, -1.4, 1.1, -0.2, 0.7, -0.6, 0.9, -1.0, 0.2, 1.3, -0.3, 0.5, -0.8];
    const c = checkSeedSweep(zs);
    expect(c.seeds).toBe(20);
    expect(c.meanTolerance).toBeCloseTo(4 / Math.sqrt(20), 15);
    expect(c.pass).toBe(true);
  });

  it('fails a biased engine (mean shifted) and a wrong σ (variance far from 1)', () => {
    expect(checkSeedSweep(Array.from({ length: 25 }, (_, i) => 1 + (i % 2 ? 0.5 : -0.5))).pass).toBe(false);
    expect(checkSeedSweep(Array.from({ length: 25 }, (_, i) => (i % 2 ? 4 : -4))).pass).toBe(false);
    expect(() => checkSeedSweep([0])).toThrow(/two seeds/);
  });
});
