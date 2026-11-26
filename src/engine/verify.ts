import type { Theoretical } from './analyser';
import type { ObservedFigure } from './stats';

/**
 * Checking the engine against the analyser (DR-006, docs/research/math-targets.md 6.2).
 *
 * Each tolerance test asserts |observed − theoretical| ≤ k · σ_theoretical / √N, with k = 4.
 * σ is the **analyser's**, never the sample's: in a skewed, heavy-tailed payout the sample
 * SD tends to come out low and would make the test falsely strict or loose. Both inputs must
 * be labelled `kind: 'theoretical'`, so a simulated figure cannot stand in for one. With a
 * fixed, recorded seed the check always passes or always fails; a failing seed is a finding
 * to investigate, never a reason to change the seed.
 */

export const DEFAULT_TOLERANCE_K = 4;

export interface ToleranceInput {
  /** The observed figure, or its value. */
  readonly observed: number | ObservedFigure<number>;
  readonly theoretical: Theoretical<number>;
  /** The theoretical standard deviation of one sample of the figure (one paid spin). */
  readonly sigma: Theoretical<number>;
  /** Samples behind the observed figure: paid spins, or the count the rate is over. */
  readonly n: number;
  readonly k?: number;
}

export interface ToleranceCheck {
  readonly observed: number;
  readonly theoretical: number;
  readonly difference: number;
  /** σ_theoretical / √N. */
  readonly standardError: number;
  /** k · standardError. */
  readonly tolerance: number;
  /** difference ÷ standardError, the "standard errors away" the panel shows. */
  readonly zScore: number;
  readonly k: number;
  readonly pass: boolean;
}

function checkTheoretical(x: Theoretical<number>, what: string): number {
  if (x.kind !== 'theoretical') throw new Error(`${what} is not labelled theoretical.`);
  if (!Number.isFinite(x.value)) throw new RangeError(`${what} is ${x.value}.`);
  return x.value;
}

/** The DR-006 check, without throwing. */
export function checkTolerance(input: ToleranceInput): ToleranceCheck {
  const k = input.k ?? DEFAULT_TOLERANCE_K;
  const observed = typeof input.observed === 'number' ? input.observed : input.observed.value;
  if (typeof input.observed !== 'number' && input.observed.kind !== 'observed') {
    throw new Error('The observed figure is not labelled observed.');
  }
  const theoretical = checkTheoretical(input.theoretical, 'The theoretical value');
  const sigma = checkTheoretical(input.sigma, 'The theoretical σ');
  if (sigma < 0) throw new RangeError(`σ is negative: ${sigma}.`);
  if (!Number.isSafeInteger(input.n) || input.n < 1) throw new RangeError(`n is a positive integer; got ${input.n}.`);
  if (!(k > 0)) throw new RangeError(`k is positive; got ${k}.`);
  const standardError = sigma / Math.sqrt(input.n);
  const difference = observed - theoretical;
  const tolerance = k * standardError;
  const zScore = standardError === 0 ? (difference === 0 ? 0 : Math.sign(difference) * Infinity) : difference / standardError;
  return { observed, theoretical, difference, standardError, tolerance, zScore, k, pass: Math.abs(difference) <= tolerance };
}

/** The DR-006 check; throws with every number when it fails. Returns the check when it passes. */
export function assertWithinTolerance(input: ToleranceInput, label = 'figure'): ToleranceCheck {
  const c = checkTolerance(input);
  if (!c.pass) {
    throw new Error(
      `Observed ${label} ${c.observed} is ${c.zScore.toFixed(2)} standard errors from the theoretical ` +
        `${c.theoretical} (|diff| ${Math.abs(c.difference)} > ${c.k}·σ/√N = ${c.tolerance}; σ ${input.sigma.value}, N ${input.n}).`,
    );
  }
  return c;
}

/** σ of one Bernoulli trial with theoretical probability p, for checking a rate. */
export function bernoulliSigma(p: Theoretical<number>): Theoretical<number> {
  const value = checkTheoretical(p, 'p');
  if (value < 0 || value > 1) throw new RangeError(`p is a probability; got ${value}.`);
  return { kind: 'theoretical', value: Math.sqrt(value * (1 - value)) };
}

export interface SeedSweepCheck {
  readonly seeds: number;
  readonly meanZ: number;
  /** k / √K. */
  readonly meanTolerance: number;
  /** Sample variance of the z-scores; near 1 when σ is right. */
  readonly varianceZ: number;
  /** 1 ± k·√(2 / (K − 1)), a normal approximation to the χ² band. */
  readonly varianceBand: { readonly low: number; readonly high: number };
  readonly pass: boolean;
}

/**
 * The seed sweep (math-targets 6.2): z-scores of K independent seeds, judged as a set. A
 * biased engine moves their mean; a wrong σ moves their variance away from 1.
 */
export function checkSeedSweep(zScores: readonly number[], k = DEFAULT_TOLERANCE_K): SeedSweepCheck {
  const K = zScores.length;
  if (K < 2) throw new RangeError('A sweep needs at least two seeds.');
  const meanZ = zScores.reduce((a, z) => a + z, 0) / K;
  const varianceZ = zScores.reduce((a, z) => a + (z - meanZ) ** 2, 0) / (K - 1);
  const meanTolerance = k / Math.sqrt(K);
  const half = k * Math.sqrt(2 / (K - 1));
  const varianceBand = { low: Math.max(0, 1 - half), high: 1 + half };
  const pass = Math.abs(meanZ) <= meanTolerance && varianceZ >= varianceBand.low && varianceZ <= varianceBand.high;
  return { seeds: K, meanZ, meanTolerance, varianceZ, varianceBand, pass };
}
