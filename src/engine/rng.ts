/**
 * The engine's random number generator: `xoshiro128**`, seeded by SplitMix64, with one
 * derived generator per paid spin and per purpose (DR-006, DR-011).
 *
 * Everything here is versioned by {@link RNG_VERSION}. Golden vectors in
 * `tests/engine/rng.test.ts` pin the generator, the seeding and the per-spin derivation, so
 * any change to what this file outputs is a new version with new vectors, never an edit:
 * old seeds must keep replaying the same spins.
 *
 * 64-bit arithmetic is done on pairs of unsigned 32-bit halves so that no BigInt is needed on
 * the hot path. The generator itself uses only 32-bit operations.
 *
 * Fit for an educational simulator: statistically good and reproducible, but not
 * cryptographic and not certified.
 */

/** Identifies the generator, its seeding and the spin derivation. Recorded in every result. */
export const RNG_VERSION = 'xoshiro128ss-v1' as const;
export type RngVersion = typeof RNG_VERSION;

/** Identifies {@link seedFromText}. Recorded beside any seed made from text. */
export const TEXT_SEED_VERSION = 'fnv1a64-splitmix-v1' as const;

const TWO_POW_32 = 0x1_0000_0000;

/** An unsigned 64-bit value as two unsigned 32-bit halves. */
export interface Seed64 {
  readonly hi: number;
  readonly lo: number;
}

/** The draws the engine makes. Every probability is an integer weight drawn through these. */
export interface Rng {
  /** A uniform integer in [0, 2^32). */
  nextUint32(): number;
  /** A uniform integer in [0, n), by rejection sampling, so exactly uniform. 1 ≤ n ≤ 2^32. */
  nextInt(n: number): number;
  /**
   * The index of a weighted choice: index i with probability weights[i] / sum(weights).
   * Weights are non-negative integers with a positive sum of at most 2^32.
   */
  pickWeighted(weights: readonly number[]): number;
}

// --------------------------------------------------------------------- 64-bit helpers

function u64(hi: number, lo: number): Seed64 {
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

function add64(a: Seed64, b: Seed64): Seed64 {
  const lo = a.lo + b.lo;
  const carry = lo >= TWO_POW_32 ? 1 : 0;
  return u64(a.hi + b.hi + carry, lo);
}

function xor64(a: Seed64, b: Seed64): Seed64 {
  return u64(a.hi ^ b.hi, a.lo ^ b.lo);
}

/** a >>> k for 0 < k < 32. */
function shr64(a: Seed64, k: number): Seed64 {
  return u64(a.hi >>> k, (a.lo >>> k) | (a.hi << (32 - k)));
}

/** The low 64 bits of a · b. */
function mul64(a: Seed64, b: Seed64): Seed64 {
  // a.lo · b.lo in full, from 16-bit halves so every partial product is exact in a double.
  const a0 = a.lo & 0xffff;
  const a1 = a.lo >>> 16;
  const b0 = b.lo & 0xffff;
  const b1 = b.lo >>> 16;
  const mid = a0 * b1 + a1 * b0; // < 2^33
  const low = a0 * b0 + (mid % 0x1_0000) * 0x1_0000; // < 2^33
  const carry = Math.floor(low / TWO_POW_32);
  const hiOfLoLo = a1 * b1 + Math.floor(mid / 0x1_0000) + carry;
  // The cross terms only reach the high half, so 32-bit wrapping multiplies are enough.
  const hi = hiOfLoLo + Math.imul(a.hi, b.lo) + Math.imul(a.lo, b.hi);
  return u64(hi, low);
}

const SPLITMIX_GAMMA = u64(0x9e3779b9, 0x7f4a7c15);
const MIX_M1 = u64(0xbf58476d, 0x1ce4e5b9);
const MIX_M2 = u64(0x94d049bb, 0x133111eb);

/** SplitMix64's output function, a bijection on 64-bit values. */
function mix64(z0: Seed64): Seed64 {
  let z = mul64(xor64(z0, shr64(z0, 30)), MIX_M1);
  z = mul64(xor64(z, shr64(z, 27)), MIX_M2);
  return xor64(z, shr64(z, 31));
}

/** The k-th output (k ≥ 1) of SplitMix64 started from `seed`: mix64(seed + k·γ). */
function splitmixOutput(seed: Seed64, k: Seed64): Seed64 {
  return mix64(add64(seed, mul64(k, SPLITMIX_GAMMA)));
}

// ------------------------------------------------------------------------- seeds

/** Parses a canonical master seed: exactly 16 hexadecimal digits. */
export function parseSeed(hex: string): Seed64 {
  if (!/^[0-9a-fA-F]{16}$/.test(hex)) {
    throw new RangeError(`A seed is 16 hexadecimal digits; got "${hex}".`);
  }
  return u64(parseInt(hex.slice(0, 8), 16), parseInt(hex.slice(8), 16));
}

/** The canonical form of a seed: 16 lowercase hexadecimal digits. */
export function formatSeed(seed: Seed64): string {
  return (
    (seed.hi >>> 0).toString(16).padStart(8, '0') + (seed.lo >>> 0).toString(16).padStart(8, '0')
  );
}

const FNV_OFFSET = u64(0xcbf29ce4, 0x84222325);
const FNV_PRIME = u64(0x00000100, 0x000001b3);

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    let cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd; // a lone surrogate, as TextEncoder does
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

/**
 * A master seed from text, such as `sweep-2026-11-25-00`: FNV-1a 64 over the UTF-8 bytes,
 * then SplitMix64's mix. Versioned by {@link TEXT_SEED_VERSION}.
 */
export function seedFromText(text: string): Seed64 {
  let h = FNV_OFFSET;
  for (const byte of utf8Bytes(text)) {
    h = mul64(u64(h.hi, h.lo ^ byte), FNV_PRIME);
  }
  return mix64(h);
}

// --------------------------------------------------------------------- generator

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** `xoshiro128**` 1.1 (Blackman and Vigna), with rejection-sampled ranges. */
export class Xoshiro128ss implements Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  /** Starts from a raw 128-bit state of four unsigned 32-bit words, not all zero. */
  constructor(state: readonly [number, number, number, number]) {
    for (const word of state) {
      if (!Number.isInteger(word) || word < 0 || word >= TWO_POW_32) {
        throw new RangeError(`A state word is an unsigned 32-bit integer; got ${word}.`);
      }
    }
    if (state.every((word) => word === 0)) {
      throw new RangeError('xoshiro128** cannot start from the all-zero state.');
    }
    [this.s0, this.s1, this.s2, this.s3] = state.map((word) => word | 0) as [
      number,
      number,
      number,
      number,
    ];
  }

  /**
   * A generator seeded from a 64-bit seed: the state is the first two outputs of SplitMix64
   * started from it, low half first. SplitMix64's output function is a bijection, so two
   * consecutive outputs are never both zero and the state is never all zero.
   */
  static fromSeed(seed: Seed64): Xoshiro128ss {
    const a = splitmixOutput(seed, u64(0, 1));
    const b = splitmixOutput(seed, u64(0, 2));
    return new Xoshiro128ss([a.lo, a.hi, b.lo, b.hi]);
  }

  nextUint32(): number {
    const s1 = this.s1;
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  nextInt(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > TWO_POW_32) {
      throw new RangeError(`nextInt needs an integer n with 1 ≤ n ≤ 2^32; got ${n}.`);
    }
    if (n === TWO_POW_32) return this.nextUint32();
    // Reject the top partial block so every residue is equally likely.
    const limit = TWO_POW_32 - (TWO_POW_32 % n);
    for (;;) {
      const r = this.nextUint32();
      if (r < limit) return r % n;
    }
  }

  pickWeighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (!Number.isInteger(w) || w < 0) {
        throw new RangeError(`A weight is a non-negative integer; got ${w}.`);
      }
      total += w;
    }
    if (total < 1 || total > TWO_POW_32) {
      throw new RangeError(`Weights must sum to between 1 and 2^32; got ${total}.`);
    }
    let r = this.nextInt(total);
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (r < w) return i;
      r -= w;
    }
    throw new Error('unreachable: the draw is below the total weight');
  }
}

/** A generator for draws outside a paid spin, for example a test. */
export function createRng(seed: Seed64): Rng {
  return Xoshiro128ss.fromSeed(seed);
}

// ----------------------------------------------------------- per-spin derivation

/**
 * The 64-bit tags that separate a spin's streams. ASCII "outcome1" and "cosmetic".
 * A new stream gets a new tag; an existing tag never changes.
 */
const STREAM_TAGS = {
  outcome: u64(0x6f757463, 0x6f6d6531),
  cosmetic: u64(0x636f736d, 0x65746963),
} as const;

export type StreamPurpose = keyof typeof STREAM_TAGS;

/** The two generators of one paid spin. */
export interface SpinStreams {
  /**
   * Everything that decides value: reel stops, the trick's rider, tier and land-or-bail, the
   * Session's reels and attempts.
   */
  readonly outcome: Rng;
  /**
   * Everything only shown: trick names, bail animations and injury ids. Adding a cosmetic
   * option therefore never changes an outcome, and old seeds replay the same wins.
   */
  readonly cosmetic: Rng;
}

function checkSpinIndex(spinIndex: number): void {
  if (!Number.isSafeInteger(spinIndex) || spinIndex < 0) {
    throw new RangeError(`A spin index is a non-negative safe integer; got ${spinIndex}.`);
  }
}

/**
 * Spin i's seed: the (i+1)-th output of SplitMix64 started from the master seed. Any spin
 * can be computed alone, so a spin replays by itself and a worker pool can split a run by
 * index range and get the same results as one thread.
 */
export function deriveSpinSeed(master: Seed64, spinIndex: number): Seed64 {
  checkSpinIndex(spinIndex);
  const k = spinIndex + 1;
  return splitmixOutput(master, u64(Math.floor(k / TWO_POW_32), k));
}

/** The seed of one stream of spin i: the spin seed XOR the stream's tag. */
export function deriveStreamSeed(
  master: Seed64,
  spinIndex: number,
  purpose: StreamPurpose,
): Seed64 {
  return xor64(deriveSpinSeed(master, spinIndex), STREAM_TAGS[purpose]);
}

/** The outcome and cosmetic generators of paid spin `spinIndex` (0-based). */
export function spinStreams(master: Seed64, spinIndex: number): SpinStreams {
  return {
    outcome: Xoshiro128ss.fromSeed(deriveStreamSeed(master, spinIndex, 'outcome')),
    cosmetic: Xoshiro128ss.fromSeed(deriveStreamSeed(master, spinIndex, 'cosmetic')),
  };
}

/** Internal 64-bit helpers, exported only so tests can check them against BigInt. */
export const __int64ForTests = { mul64, add64, mix64, splitmixOutput } as const;
