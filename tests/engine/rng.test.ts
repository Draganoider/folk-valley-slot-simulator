import { describe, expect, it } from 'vitest';
import {
  RNG_VERSION,
  Xoshiro128ss,
  __int64ForTests,
  createRng,
  deriveSpinSeed,
  deriveStreamSeed,
  formatSeed,
  parseSeed,
  seedFromText,
  spinStreams,
  type Seed64,
} from '../../src/engine/rng';

// Golden vectors. They were produced by an independent Python implementation of the
// reference algorithms (SplitMix64, xoshiro128** 1.1) and the v1 derivation, kept in
// .scratch/engine-foundation/rng_reference.py when they were made. A failing vector means
// the generator's output changed: that is a new RNG_VERSION with new vectors, never an edit
// to make the test pass, because old seeds must keep replaying the same spins.

const MASTER = parseSeed('0123456789abcdef');

function take(rng: { nextUint32(): number }, n: number): number[] {
  return Array.from({ length: n }, () => rng.nextUint32());
}

function toBig(v: Seed64): bigint {
  return (BigInt(v.hi) << 32n) | BigInt(v.lo);
}

function fromBig(v: bigint): Seed64 {
  return { hi: Number((v >> 32n) & 0xffffffffn), lo: Number(v & 0xffffffffn) };
}

describe('version', () => {
  it('is xoshiro128ss-v1', () => {
    expect(RNG_VERSION).toBe('xoshiro128ss-v1');
  });
});

describe('64-bit arithmetic', () => {
  const M64 = (1n << 64n) - 1n;
  // A fixed sample generated from the generator itself, plus edge values.
  const edge = [0n, 1n, 0xffffffffn, 0x100000000n, M64, 0x8000000000000000n, 0x9e3779b97f4a7c15n];
  const sampler = createRng(parseSeed('00000000deadbeef'));
  const sample = Array.from({ length: 200 }, () => toBig({ hi: sampler.nextUint32(), lo: sampler.nextUint32() }));
  const values = [...edge, ...sample];

  it('multiplies like BigInt modulo 2^64', () => {
    for (let i = 0; i < values.length; i++) {
      const a = values[i] as bigint;
      const b = values[(i * 7 + 3) % values.length] as bigint;
      expect(toBig(__int64ForTests.mul64(fromBig(a), fromBig(b)))).toBe((a * b) & M64);
    }
  });

  it('adds like BigInt modulo 2^64', () => {
    for (let i = 0; i < values.length; i++) {
      const a = values[i] as bigint;
      const b = values[(i * 5 + 1) % values.length] as bigint;
      expect(toBig(__int64ForTests.add64(fromBig(a), fromBig(b)))).toBe((a + b) & M64);
    }
  });

  it("matches SplitMix64's published first output for seed 0", () => {
    expect(formatSeed(__int64ForTests.splitmixOutput({ hi: 0, lo: 0 }, { hi: 0, lo: 1 }))).toBe(
      'e220a8397b1dcdaf',
    );
  });
});

describe('xoshiro128**', () => {
  it('matches the reference from the raw state 1, 2, 3, 4', () => {
    expect(take(new Xoshiro128ss([1, 2, 3, 4]), 8)).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849,
    ]);
  });

  it('pins the SplitMix64 seeding', () => {
    expect(take(Xoshiro128ss.fromSeed(parseSeed('0000000000000000')), 6)).toEqual([
      3737715805, 2584255861, 2876756834, 3286328325, 1553311962, 1625202774,
    ]);
    expect(take(Xoshiro128ss.fromSeed(MASTER), 6)).toEqual([
      1038917469, 3889024309, 3818883509, 328341858, 2220985983, 3755725176,
    ]);
    expect(take(Xoshiro128ss.fromSeed(parseSeed('ffffffffffffffff')), 6)).toEqual([
      477689756, 2493998634, 555695776, 607808419, 61340979, 301466976,
    ]);
  });

  it('refuses the all-zero state and words outside 32 bits', () => {
    expect(() => new Xoshiro128ss([0, 0, 0, 0])).toThrow(RangeError);
    expect(() => new Xoshiro128ss([2 ** 32, 0, 0, 1])).toThrow(RangeError);
    expect(() => new Xoshiro128ss([-1, 0, 0, 1])).toThrow(RangeError);
  });
});

describe('nextInt', () => {
  it('pins rejection-sampled draws', () => {
    const rng = createRng(MASTER);
    const ns = [1, 2, 3, 5, 7, 10, 100, 243, 1000, 2 ** 31 + 1];
    expect(ns.map((n) => rng.nextInt(n))).toEqual([0, 1, 2, 3, 6, 6, 14, 159, 807, 2107927194]);
  });

  it('rejects the partial top block instead of folding it', () => {
    // With n = 3, 2^32 mod 3 = 1, so only the single draw 2^32 - 1 is rejected. Folding it
    // would return 0 and make 0 slightly more likely than 1 or 2.
    class Scripted extends Xoshiro128ss {
      private readonly draws: number[];
      constructor(draws: number[]) {
        super([1, 2, 3, 4]);
        this.draws = draws;
      }
      override nextUint32(): number {
        const next = this.draws.shift();
        if (next === undefined) throw new Error('script ran out');
        return next;
      }
    }
    expect(new Scripted([2 ** 32 - 1, 5]).nextInt(3)).toBe(2);
    expect(new Scripted([2 ** 32 - 2]).nextInt(3)).toBe((2 ** 32 - 2) % 3);
    // n = 2^31 + 1 rejects almost half the range.
    const n = 2 ** 31 + 1;
    expect(new Scripted([2 ** 31 + 1, 2 ** 32 - 1, 7]).nextInt(n)).toBe(7);
  });

  it('stays in range and covers every value', () => {
    const rng = createRng(parseSeed('a5a5a5a5a5a5a5a5'));
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 70_000; i++) {
      const v = rng.nextInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      counts[v] = (counts[v] as number) + 1;
    }
    // Each count is Binomial(70000, 1/7): mean 10000, SD about 92. 6 SD is a loose bound
    // that a correct generator passes with this fixed seed, and a modulo bias would not
    // show at n = 7 anyway; the golden draws above pin the exact behaviour.
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(560);
  });

  it('refuses ranges it cannot draw exactly', () => {
    const rng = createRng(MASTER);
    for (const n of [0, -1, 1.5, 2 ** 32 + 1, Number.NaN]) {
      expect(() => rng.nextInt(n)).toThrow(RangeError);
    }
    expect(() => rng.nextInt(2 ** 32)).not.toThrow();
  });
});

describe('pickWeighted', () => {
  it('never picks a zero weight and follows nextInt', () => {
    const a = createRng(MASTER);
    const b = createRng(MASTER);
    for (let i = 0; i < 1000; i++) {
      const pick = a.pickWeighted([3, 0, 5, 2]);
      const r = b.nextInt(10);
      expect(pick).toBe(r < 3 ? 0 : r < 8 ? 2 : 3);
    }
  });

  it('refuses weights that are not non-negative integers with a positive sum', () => {
    const rng = createRng(MASTER);
    expect(() => rng.pickWeighted([])).toThrow(RangeError);
    expect(() => rng.pickWeighted([0, 0])).toThrow(RangeError);
    expect(() => rng.pickWeighted([1, -1, 2])).toThrow(RangeError);
    expect(() => rng.pickWeighted([0.5, 0.5])).toThrow(RangeError);
    expect(() => rng.pickWeighted([2 ** 32, 1])).toThrow(RangeError);
  });
});

describe('seeds', () => {
  it('round-trips the canonical 16-digit form', () => {
    for (const hex of ['0000000000000000', '0123456789abcdef', 'ffffffffffffffff']) {
      expect(formatSeed(parseSeed(hex))).toBe(hex);
    }
    expect(formatSeed(parseSeed('0123456789ABCDEF'))).toBe('0123456789abcdef');
  });

  it('refuses anything but 16 hex digits', () => {
    for (const bad of ['', '123', '0123456789abcdef0', '0x23456789abcdef', 'g123456789abcdef']) {
      expect(() => parseSeed(bad)).toThrow(RangeError);
    }
  });

  it('pins text seeds', () => {
    expect(formatSeed(seedFromText(''))).toBe('f52a15e9a9b5e89b');
    expect(formatSeed(seedFromText('a'))).toBe('02c0bdbf481420f8');
    expect(formatSeed(seedFromText('sweep-2026-11-25-00'))).toBe('4ac1996682f78dac');
    expect(formatSeed(seedFromText('Folk Valley ✓'))).toBe('4803bf4e536c2fb8');
    expect(formatSeed(seedFromText('\u{1F6F9}'))).toBe('ec39cbc1461ebba6');
  });
});

describe('per-spin derivation', () => {
  const cases: [number, string, string, string][] = [
    [0, '157a3807a48faa9d', '7a0f4c64cbe2cfac', '76154b6ac1fbc3fe'],
    [1, 'd573529b34a1d093', 'ba0626f85bccb5a2', 'b61c21f651d5b9f0'],
    [2, '2f90b72e996dccbe', '40e5c34df600a98f', '4cffc443fc19a5dd'],
    [1000, '825a7e1c8e8ace2b', 'ed2f0a7fe1e7ab1a', 'e1350d71ebfea748'],
    [2 ** 32, 'a6fb94d5ae1fc3f3', 'c98ee0b6c172a6c2', 'c594e7b8cb6baa90'],
    [Number.MAX_SAFE_INTEGER, 'a8f039ad16661eac', 'c7854dce790b7b9d', 'cb9f4ac0731277cf'],
  ];

  it.each(cases)('pins spin %d', (index, spin, outcome, cosmetic) => {
    expect(formatSeed(deriveSpinSeed(MASTER, index))).toBe(spin);
    expect(formatSeed(deriveStreamSeed(MASTER, index, 'outcome'))).toBe(outcome);
    expect(formatSeed(deriveStreamSeed(MASTER, index, 'cosmetic'))).toBe(cosmetic);
  });

  it('pins the first draws of both streams of a spin', () => {
    const streams = spinStreams(MASTER, 7);
    expect(take(streams.outcome, 4)).toEqual([2694717927, 1334124454, 2187392486, 2308575356]);
    expect(take(streams.cosmetic, 4)).toEqual([1506096034, 3523451901, 149569135, 3069228426]);
  });

  it('replays a spin alone, whatever ran before it', () => {
    const before = spinStreams(MASTER, 42);
    const first = take(before.outcome, 10);
    // Draining other spins' streams, or more of this spin's cosmetic stream, changes nothing.
    for (let i = 0; i < 42; i++) take(spinStreams(MASTER, i).outcome, 100);
    take(before.cosmetic, 1000);
    expect(take(spinStreams(MASTER, 42).outcome, 10)).toEqual(first);
  });

  it('keeps the cosmetic stream apart from the outcome stream', () => {
    const outcomeOnly = take(spinStreams(MASTER, 3).outcome, 20);
    const streams = spinStreams(MASTER, 3);
    take(streams.cosmetic, 500); // many cosmetic draws, as a new bail animation would add
    expect(take(streams.outcome, 20)).toEqual(outcomeOnly);
  });

  it('refuses spin indices that are not non-negative safe integers', () => {
    for (const bad of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(() => deriveSpinSeed(MASTER, bad)).toThrow(RangeError);
    }
  });
});
