import type { GameConfig } from './config';
import { reelSweep } from './analyse-base';
import { ONE, ZERO, add, mul, rat, type Rational } from './rational';

/**
 * The Session, exactly (DR-005, DR-006, math-targets 5.3).
 *
 * A free spin's ways coins W are independent of the ladder: the stops and the attempt come
 * from separate draws, and the Session strips have no wild reels. So a Session's total is
 * S = Σ mᵢ·Wᵢ, where m₁, m₂, … are the multipliers after each attempt, a Markov chain over
 * (rung, pain, spins left) that ends at the pain limit or when the spins run out, and the Wᵢ
 * are independent copies of W.
 *
 * - **Exact moments.** With A = Σ mᵢ and Q = Σ mᵢ², E[S] = E[W]·E[A] and
 *   E[S²] = Var(W)·E[Q] + E[W]²·E[A²], and E[A], E[Q], E[A²] follow from a backward pass over
 *   the chain in rationals. So the uncapped Session mean and second moment are exact.
 * - **The distribution, truncated at the cap.** A backward dynamic programme gives, for every
 *   state, the distribution of what the rest of the Session pays, in whole coins, with every
 *   total at or above the cap lumped into the last cell. That is what the 2,500× cap on the
 *   whole paid spin needs (the Session pays min(S, cap − base win), so the paid spin pays
 *   min(base + S, cap)), and it gives σ, the hit rates and the distribution. It is float64:
 *   every cell is a sum of products of non-negative numbers, so its relative error is at
 *   most `relativeErrorBound` (no cancellation anywhere), and its mean is checked against
 *   the exact one.
 */

/** W: a free spin's ways coins, as sorted distinct values with integer weights out of `total`. */
export interface SpinDistribution {
  readonly values: readonly number[];
  readonly weights: readonly number[];
  readonly total: number;
  readonly mean: Rational;
  readonly secondMoment: Rational;
  /** P(W = 0). */
  readonly pZero: Rational;
}

export function sessionSpinDistribution(config: GameConfig): SpinDistribution {
  const sweep = reelSweep(config, config.session.reels, [], false);
  const byCoins = new Map<number, number>();
  for (const c of sweep.cells) byCoins.set(c.coins, (byCoins.get(c.coins) ?? 0) + c.weight);
  const values = [...byCoins.keys()].sort((a, b) => a - b);
  const weights = values.map((v) => byCoins.get(v) as number);
  let m1 = 0n;
  let m2 = 0n;
  values.forEach((v, i) => {
    const w = BigInt(weights[i] as number);
    m1 += w * BigInt(v);
    m2 += w * BigInt(v) * BigInt(v);
  });
  const T = BigInt(sweep.total);
  return {
    values,
    weights,
    total: sweep.total,
    mean: rat(m1, T),
    secondMoment: rat(m2, T),
    pZero: rat(BigInt(byCoins.get(0) ?? 0), T),
  };
}

/** A ladder state before a free spin. */
export interface LadderPosition {
  readonly rung: number;
  readonly pain: number;
  readonly spinsLeft: number;
}

interface Transition {
  readonly p: Rational;
  readonly pf: number;
  /** The multiplier on this spin's win, the one after the attempt. */
  readonly multiplier: number;
  /** The state before the next spin, or null when the Session ends after this one. */
  readonly next: LadderPosition | null;
  readonly endsByPain: boolean;
}

const keyOf = (s: LadderPosition): string => `${s.rung},${s.pain},${s.spinsLeft}`;

/** The two outcomes of the attempt from `state`, land first; one with weight 0 is left out. */
export function transitions(config: GameConfig, state: LadderPosition): Transition[] {
  const session = config.session;
  const top = session.rungs.length - 1;
  const rung = session.rungs[state.rung];
  if (rung === undefined) throw new RangeError(`Rung ${state.rung} is outside the ladder.`);
  const odds = rung.odds.land + rung.odds.bail;
  const out: Transition[] = [];
  if (rung.odds.land > 0) {
    const r = Math.min(state.rung + 1, top);
    const left = state.spinsLeft - 1;
    out.push({
      p: rat(rung.odds.land, odds),
      pf: rung.odds.land / odds,
      multiplier: (session.rungs[r] as (typeof session.rungs)[number]).multiplier,
      next: left > 0 ? { rung: r, pain: state.pain, spinsLeft: left } : null,
      endsByPain: false,
    });
  }
  if (rung.odds.bail > 0) {
    const pain = state.pain + 1;
    const byPain = pain >= session.painLimit;
    const left = state.spinsLeft - 1 + (byPain ? 0 : session.extraSpinsPerBail);
    out.push({
      p: rat(rung.odds.bail, odds),
      pf: rung.odds.bail / odds,
      multiplier: rung.multiplier,
      next: byPain || left <= 0 ? null : { rung: state.rung, pain, spinsLeft: left },
      endsByPain: byPain,
    });
  }
  return out;
}

/** The state a Session starts in from `startRung`. */
export function sessionStartState(config: GameConfig, startRung: number): LadderPosition {
  return { rung: startRung, pain: 0, spinsLeft: config.session.startingSpins };
}

/** Exact figures of the ladder from one state, uncapped. */
export interface LadderMoments {
  /** E[Σ mᵢ]. */
  readonly a: Rational;
  /** E[Σ mᵢ²]. */
  readonly q: Rational;
  /** E[(Σ mᵢ)²]. */
  readonly s: Rational;
  /** E[number of free spins]. */
  readonly spins: Rational;
  /** P(the Session ends at the pain limit). */
  readonly painEnd: Rational;
  /** E[z^spins] at z = P(W = 0): the probability that every free spin pays nothing. */
  readonly allZero: Rational;
  /** The largest Σ mᵢ any path reaches, for the max win. */
  readonly maxA: number;
  /** The most free spins any path plays. */
  readonly maxSpins: number;
}

/** {@link LadderMoments} for every reachable state, by backward recursion with memo. */
export function ladderMoments(config: GameConfig, pZero: Rational): (s: LadderPosition) => LadderMoments {
  const memo = new Map<string, LadderMoments>();
  const end: LadderMoments = { a: ZERO, q: ZERO, s: ZERO, spins: ZERO, painEnd: ZERO, allZero: ONE, maxA: 0, maxSpins: 0 };
  const visit = (state: LadderPosition): LadderMoments => {
    const key = keyOf(state);
    const seen = memo.get(key);
    if (seen !== undefined) return seen;
    let a = ZERO;
    let q = ZERO;
    let s = ZERO;
    let spins = ZERO;
    let painEnd = ZERO;
    let allZero = ZERO;
    let maxA = 0;
    let maxSpins = 0;
    for (const t of transitions(config, state)) {
      const nx = t.next === null ? end : visit(t.next);
      const m = rat(t.multiplier);
      a = add(a, mul(t.p, add(m, nx.a)));
      q = add(q, mul(t.p, add(mul(m, m), nx.q)));
      s = add(s, mul(t.p, add(add(mul(m, m), mul(rat(2), mul(m, nx.a))), nx.s)));
      spins = add(spins, mul(t.p, add(ONE, nx.spins)));
      painEnd = add(painEnd, mul(t.p, t.endsByPain ? ONE : nx.painEnd));
      allZero = add(allZero, mul(t.p, mul(pZero, nx.allZero)));
      maxA = Math.max(maxA, t.multiplier + nx.maxA);
      maxSpins = Math.max(maxSpins, 1 + nx.maxSpins);
    }
    const result = { a, q, s, spins, painEnd, allZero, maxA, maxSpins };
    memo.set(key, result);
    return result;
  };
  return visit;
}

/** The distribution of a Session's total from its start, truncated at the cap. */
export interface SessionDistribution {
  /** `p[x]` = P(S = x) for x < cap; `p[cap]` = P(S ≥ cap). Length cap + 1. */
  readonly p: Float64Array;
  /** The bound on every cell's relative error. */
  readonly relativeErrorBound: number;
  /** Ladder states the programme visited. */
  readonly states: number;
}

const U = 2 ** -53;

/**
 * Session totals from each of `startRungs`, truncated at `cap` coins: one backward pass over
 * every reachable ladder state, shared by all the start rungs.
 */
export function sessionDistributions(
  config: GameConfig,
  w: SpinDistribution,
  startRungs: readonly number[],
  cap: number,
): Map<number, SessionDistribution> {
  const probs = w.weights.map((x) => x / w.total);
  const values = w.values;
  const K = values.length;
  const memo = new Map<string, { p: Float64Array; top: number; depth: number }>();
  const delta0 = new Float64Array(cap + 1);
  delta0[0] = 1;
  const terminal = { p: delta0, top: 0, depth: 0 };

  // out += scale · (m·W ⊕ A), truncated at cap. `top` is A's highest non-zero cell below cap.
  const addConvolution = (out: Float64Array, A: Float64Array, top: number, m: number, scale: number): void => {
    // Suffix sums of A, so a shift past the cap lumps A's upper part in one step.
    const suffix = new Float64Array(cap + 2);
    for (let x = cap; x >= 0; x--) suffix[x] = (suffix[x + 1] as number) + (A[x] as number);
    for (let j = 0; j < K; j++) {
      const pj = scale * (probs[j] as number);
      if (pj === 0) continue;
      const v = m * (values[j] as number);
      if (v >= cap) {
        out[cap] = (out[cap] as number) + pj * (suffix[0] as number);
        continue;
      }
      const last = Math.min(top, cap - 1 - v);
      for (let x = 0; x <= last; x++) out[x + v] = (out[x + v] as number) + pj * (A[x] as number);
      // Cells of A that the shift carries to the cap or beyond, and A's own lumped cell.
      out[cap] = (out[cap] as number) + pj * (suffix[cap - v] as number);
    }
  };

  const visit = (state: LadderPosition): { p: Float64Array; top: number; depth: number } => {
    const key = keyOf(state);
    const seen = memo.get(key);
    if (seen !== undefined) return seen;
    const out = new Float64Array(cap + 1);
    let depth = 0;
    for (const t of transitions(config, state)) {
      const nx = t.next === null ? terminal : visit(t.next);
      addConvolution(out, nx.p, nx.top, t.multiplier, t.pf);
      depth = Math.max(depth, nx.depth);
    }
    let top = 0;
    for (let x = cap - 1; x >= 0; x--) {
      if ((out[x] as number) !== 0) {
        top = x;
        break;
      }
    }
    // Roundings per spin level along any path into a cell: the suffix sum (cap + 1 terms),
    // up to K terms from each of the two outcomes, and the products.
    const result = { p: out, top, depth: depth + cap + 2 * K + 5 };
    memo.set(key, result);
    return result;
  };

  const results = new Map<number, SessionDistribution>();
  for (const r of startRungs) {
    const d = visit(sessionStartState(config, r));
    results.set(r, { p: d.p, relativeErrorBound: d.depth * U * 1.01, states: memo.size });
  }
  return results;
}
