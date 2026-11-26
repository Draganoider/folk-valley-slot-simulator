import { FLYERS_TO_TRIGGER, WILD_REELS, maxWinCoins, type GameConfig, type TrickTierId } from './config';
import { landingWildSets, reelSweep, type SweepResult } from './analyse-base';
import {
  ladderMoments,
  sessionDistributions,
  sessionSpinDistribution,
  sessionStartState,
  type LadderMoments,
  type SessionDistribution,
} from './analyse-session';
import { ONE, ZERO, add, div, mul, rat, sub, toJson, toNumber, type Rational, type RationalJson } from './rational';
import { WIN_HISTOGRAM_EDGES, WIN_HISTOGRAM_LABELS } from './stats';

/**
 * The exact analyser: every theoretical figure, computed from the configuration and never
 * from a simulation (DR-006, docs/research/math-targets.md section 5).
 *
 * A paid spin is analysed in four parts, each exact:
 *
 * 1. **The base game** (`analyse-base.ts`): the distribution of ways coins by leftmost
 *    Kicker reel and Flyer count, over every stop combination, once with no wild reels and
 *    once for each set of reels a landing can turn wild.
 * 2. **The trick** in ordinary spins: for each tier, its weight, land or bail, and on a
 *    landing each set of extra wild reels with its exact probability and the tier's
 *    multiplier. A bail pays the plain ways win and adds a Scar Card mark.
 * 3. **The Session** (`analyse-session.ts`): exact moments over the ladder's Markov chain,
 *    and the distribution of its total truncated at the cap.
 * 4. **The Scar Card**: a Markov chain over its marks, with DR-012's held mark (at size − 1,
 *    a bail on a spin with 3+ Flyers stays at size − 1), and its stationary distribution.
 *    Every theoretical rate is the long-run rate under it.
 *
 * Exactness. Everything uncapped — the mean, the RTP split, the second moment and so σ, every
 * feature rate and the stationary distribution — is a rational number in BigInt, and the
 * report carries the exact fractions. What depends on the 2,500× cap or on the shape of the
 * distribution (the capped RTP and σ, the hit, win-above-bet and LDW rates, the cap
 * probability and the payout histogram) is float64 over the truncated Session distribution.
 * Those are sums of products of non-negative numbers, so their relative error is at most
 * `floatError.relative` (about 10⁻¹⁰), except σ, a difference of two moments, whose absolute
 * error bound is `floatError.sigmaAbsolute`.
 */

/** A theoretical figure, labelled so it is never shown as an observed one (rule 6). */
export interface Theoretical<T> {
  readonly kind: 'theoretical';
  readonly value: T;
}

function theo<T>(value: T): Theoretical<T> {
  return { kind: 'theoretical', value };
}

export const ANALYSER_VERSION = 'folk-valley-analyser-1';

/** The RTP by source, as shares of the amount bet. */
export interface RtpSplit {
  readonly baseWays: number;
  readonly trickLandings: number;
  readonly sessionFromFlyers: number;
  readonly sessionFromScarCard: number;
}

export interface TrickTierFigures {
  readonly id: TrickTierId;
  /** P(a paid spin starts an attempt of this tier). */
  readonly attemptProbability: number;
  readonly landProbability: number;
  /** E[base win, multiplier included | this tier landed], × bet. */
  readonly meanWinWhenLanded: number;
  /** E[the same grid's plain ways win | this tier landed], × bet: what the trick adds is the difference. */
  readonly meanPlainWinWhenLanded: number;
  /** Each wild-reel set a landing of this tier gives (1-based reels), with its probability given a landing. */
  readonly wildReelSets: readonly { readonly reels: readonly number[]; readonly probability: number }[];
}

export interface SessionFigures {
  readonly trigger: 'flyers3' | 'flyers4' | 'flyers5' | 'scarCard';
  readonly startRung: number;
  /** Long-run Sessions of this trigger per paid spin. */
  readonly rate: number;
  /** E[Session total], uncapped, × bet. */
  readonly meanWin: number;
  /** SD of the Session total, uncapped, × bet. */
  readonly sdWin: number;
  readonly meanSpins: number;
  /** P(the Session ends at the pain limit), uncapped. */
  readonly painLimitProbability: number;
  /** P(every free spin pays nothing). */
  readonly zeroProbability: number;
  readonly maxSpins: number;
}

export interface TheoreticalReport {
  readonly label: 'theoretical';
  readonly analyserVersion: string;
  readonly configId: string;
  readonly costCoins: number;
  readonly capCoins: number;

  /** Expected payout per paid spin ÷ its cost, cap included, under the Scar Card's stationary distribution. */
  readonly rtp: Theoretical<number>;
  /** The same without the cap. Exact; `exact.rtpUncapped` is the fraction. */
  readonly rtpUncapped: Theoretical<number>;
  /** What the cap takes off the RTP. */
  readonly capReduction: Theoretical<number>;
  /**
   * The split the simulation's statistics use (`summarise` in stats.ts): base ways on spins
   * whose trick did not land, every base win on spins whose trick landed, and each Session's
   * total by its cause (Sessions stop at the cap). It sums to `rtp` unless a base win alone
   * passes the cap, which the shipped configuration cannot do; like the statistics, it then
   * counts that base win in full.
   */
  readonly rtpSplit: Theoretical<RtpSplit>;
  /**
   * The split DR-006 tunes to (math-targets section 3): the plain ways win of every grid as
   * the base game, only what a landing adds on top (its wild reels and multiplier) as the
   * trick, and the Sessions. Capped; sums to `rtp`.
   */
  readonly rtpSplitByUplift: Theoretical<{ readonly baseGame: number; readonly trickUplift: number; readonly session: number }>;
  /** Standard deviation of one paid spin's payout under the stationary distribution, × bet. */
  readonly sigma: Theoretical<number>;
  /**
   * √(lim Var(Σ payouts) / N), × bet: the σ for a tolerance on N consecutive paid spins. It
   * differs from `sigma` because the Scar Card correlates spins; the two are close.
   */
  readonly sigmaLongRun: Theoretical<number>;
  readonly hitFrequency: Theoretical<number>;
  readonly winAboveBetFrequency: Theoretical<number>;
  readonly evenMoneyFrequency: Theoretical<number>;
  readonly ldwFrequency: Theoretical<number>;
  /** Base-game trick attempts per paid spin. */
  readonly trickRate: Theoretical<number>;
  /** P(land | attempt). */
  readonly trickLandRate: Theoretical<number>;
  /** Sessions per paid spin, long run. */
  readonly sessionRate: Theoretical<number>;
  readonly capProbability: Theoretical<number>;
  /** The largest payout with non-zero probability, and that probability. */
  readonly maxWin: Theoretical<{ readonly coins: number; readonly timesBet: number; readonly probability: number }>;
  /** P(payout in each bucket), the buckets of the statistics' histogram. */
  readonly winDistribution: Theoretical<readonly { readonly bucket: string; readonly probability: number }[]>;

  readonly trickTiers: Theoretical<readonly TrickTierFigures[]>;
  readonly sessions: Theoretical<readonly SessionFigures[]>;
  readonly scarCard: Theoretical<{
    readonly size: number;
    /** P(a paid spin bails). */
    readonly bailProbability: number;
    /** P(a paid spin bails and shows 3+ Flyers): the held-mark transition at size − 1. */
    readonly bailWithFlyersProbability: number;
    /** π(marks), 0 to size − 1. */
    readonly stationary: readonly number[];
    /**
     * The same chain for every bet level. Amounts are coins and the card is kept per level,
     * so every level's chain is identical (DR-011); listed so the panel can show its own.
     */
    readonly betLevels: readonly number[];
  }>;
  /** Base game alone: the plain ways win of a paid spin's grid, no trick, no Session. */
  readonly baseGame: Theoretical<{ readonly rtp: number; readonly hitFrequency: number; readonly sigma: number }>;

  /** The exact fractions behind the uncapped figures. */
  readonly exact: {
    readonly rtpUncapped: RationalJson;
    readonly secondMomentUncappedCoins2: RationalJson;
    readonly trickRate: RationalJson;
    readonly sessionRate: RationalJson;
    readonly scarCardStationaryLast: RationalJson;
  };
  readonly floatError: {
    /** Bound on the relative error of every float figure except σ. */
    readonly relative: number;
    /** Bound on the absolute error of `sigma`, × bet. */
    readonly sigmaAbsolute: number;
    /**
     * |float mean − exact mean| ÷ exact mean of the Session totals, the float one truncated at
     * the cap: a check on the bound, since what the cap cuts off is far smaller still.
     */
    readonly sessionMeanCheck: number;
  };
  readonly work: {
    readonly baseCells: number;
    readonly sessionSpinValues: number;
    readonly ladderStates: number;
    readonly milliseconds: number;
  };
}

type Outcome = 'none' | 'landed' | 'bailed';

/** One class of base outcome: a Flyer count and a trick outcome, with its base-win histogram. */
interface Group {
  readonly flyers: number;
  readonly outcome: Outcome;
  /** coins (multiplier included) → weight over `den`. */
  readonly hist: Map<number, bigint>;
}

function bump(map: Map<number, bigint>, coins: number, weight: bigint): void {
  map.set(coins, (map.get(coins) ?? 0n) + weight);
}

function lcm(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y !== 0n) [x, y] = [y, x % y];
  return (a / x) * b;
}

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

interface Now {
  (): number;
}

/**
 * Every theoretical figure of a configuration that has passed `validateConfig`. Takes about a
 * second on the shipped configuration.
 *
 * @param now A clock for the `work.milliseconds` record only; pass one from the host (the
 *   engine reads no global clock). Defaults to none (0).
 */
export function analyse(config: GameConfig, now: Now = () => 0): TheoreticalReport {
  const started = now();
  const cost = config.bet.coinsPerSpin;
  const cap = maxWinCoins(config);
  const costR = rat(cost);

  // ---------------------------------------------------------------- base and trick
  const tiers = config.trickTiers;
  const tierTotal = BigInt(tiers.reduce((a, t) => a + t.weight, 0));
  let oddsLcm = 1n;
  let chooseLcm = 1n;
  for (const t of tiers) {
    oddsLcm = lcm(oddsLcm, BigInt(t.odds.land + t.odds.bail));
    chooseLcm = lcm(chooseLcm, BigInt(choose(WILD_REELS.length - 1, t.landing.extraWildReels)));
  }
  const plain = reelSweep(config, config.reels);
  const comboTotal = BigInt(plain.total);
  const factorTotal = tierTotal * oddsLcm * chooseLcm;
  const den = comboTotal * factorTotal;

  const sweeps = new Map<string, SweepResult>();
  for (const set of landingWildSets()) {
    if (tiers.some((t) => t.landing.extraWildReels + 1 === set.length)) {
      sweeps.set(set.join(','), reelSweep(config, config.reels, set));
    }
  }

  const groups = new Map<string, Group>();
  const group = (flyers: number, outcome: Outcome): Group => {
    const key = `${flyers}|${outcome}`;
    let g = groups.get(key);
    if (g === undefined) {
      g = { flyers, outcome, hist: new Map() };
      groups.set(key, g);
    }
    return g;
  };

  // Per tier: attempt weight, land weight, plain and boosted coin sums (over den).
  const tierAcc = tiers.map(() => ({ attempt: 0n, land: 0n, winLanded: 0n, plainLanded: 0n, sets: new Map<string, bigint>() }));
  let kickerWeight = 0n;
  let plainSum = 0n;
  let plainSq = 0n;
  let plainHits = 0n;
  let plainLandedSum = 0n;

  for (const cell of plain.cells) {
    const w = BigInt(cell.weight);
    const coins = BigInt(cell.coins);
    plainSum += w * coins * factorTotal;
    plainSq += w * coins * coins * factorTotal;
    if (cell.coins > 0) plainHits += w * factorTotal;
    if (cell.kicker < 0) {
      bump(group(cell.flyers, 'none').hist, cell.coins, w * factorTotal);
      continue;
    }
    kickerWeight += w * factorTotal;
    tiers.forEach((t, i) => {
      const odds = BigInt(t.odds.land + t.odds.bail);
      const base = w * BigInt(t.weight) * (oddsLcm / odds) * chooseLcm;
      const acc = tierAcc[i] as (typeof tierAcc)[number];
      acc.attempt += base * odds;
      if (t.odds.bail > 0) bump(group(cell.flyers, 'bailed').hist, cell.coins, base * BigInt(t.odds.bail));
      const landW = base * BigInt(t.odds.land);
      acc.land += landW;
      acc.plainLanded += landW * coins;
      plainLandedSum += landW * coins;
    });
  }

  // Landings: for each kicker reel k, tier t and set E of extra reels, the sweep with {k} ∪ E wild.
  tiers.forEach((t, i) => {
    if (t.odds.land === 0) return;
    const acc = tierAcc[i] as (typeof tierAcc)[number];
    const odds = BigInt(t.odds.land + t.odds.bail);
    const e = t.landing.extraWildReels;
    const per = (chooseLcm / BigInt(choose(WILD_REELS.length - 1, e))) * BigInt(t.weight) * (oddsLcm / odds) * BigInt(t.odds.land);
    for (const k of WILD_REELS) {
      const others = WILD_REELS.filter((r) => r !== k);
      for (const set of landingWildSets()) {
        if (set.length !== e + 1 || !set.includes(k) || !set.every((r) => r === k || others.includes(r))) continue;
        const sweep = sweeps.get(set.join(',')) as SweepResult;
        const setKey = set.map((r) => r + 1).join(',');
        for (const cell of sweep.cells) {
          if (cell.kicker !== k) continue;
          const w = BigInt(cell.weight) * per;
          const coins = cell.coins * t.landing.winMultiplier;
          bump(group(cell.flyers, 'landed').hist, coins, w);
          acc.winLanded += w * BigInt(coins);
          acc.sets.set(setKey, (acc.sets.get(setKey) ?? 0n) + w);
        }
      }
    }
  });

  // ---------------------------------------------------------------- the Session
  const w = sessionSpinDistribution(config);
  const moments = ladderMoments(config, w.pZero);
  const start = config.session.startRung;
  const triggers = [
    { trigger: 'flyers3', rung: start.flyers3 },
    { trigger: 'flyers4', rung: start.flyers4 },
    { trigger: 'flyers5', rung: start.flyers5 },
    { trigger: 'scarCard', rung: start.scarCard },
  ] as const;
  const rungs = [...new Set(triggers.map((t) => t.rung))];
  const dists = sessionDistributions(config, w, rungs, cap);
  const varW = sub(w.secondMoment, mul(w.mean, w.mean));
  const sessionMoments = new Map<number, { m: LadderMoments; mean: Rational; second: Rational }>();
  for (const r of rungs) {
    const m = moments(sessionStartState(config, r));
    sessionMoments.set(r, {
      m,
      mean: mul(w.mean, m.a),
      second: add(mul(varW, m.q), mul(mul(w.mean, w.mean), m.s)),
    });
  }
  const triggerRung = (flyers: number): number =>
    flyers === 3 ? start.flyers3 : flyers === 4 ? start.flyers4 : start.flyers5;

  // ---------------------------------------------------------------- the Scar Card
  let bail = ZERO;
  let bailFlyers = ZERO;
  for (const g of groups.values()) {
    if (g.outcome !== 'bailed') continue;
    let s = 0n;
    for (const v of g.hist.values()) s += v;
    const p = rat(s, den);
    bail = add(bail, p);
    if (g.flyers >= FLYERS_TO_TRIGGER) bailFlyers = add(bailFlyers, p);
  }
  const size = config.scarCard.size;
  const stationary: Rational[] = [];
  if (bail.n === 0n) {
    for (let s = 0; s < size; s++) stationary.push(s === 0 ? ONE : ZERO);
  } else {
    // Equal flow round the cycle: π_s·b for s < size − 1, π_last·(b − b_F) from the last.
    const out = sub(bail, bailFlyers);
    const c = div(ONE, add(div(rat(size - 1), bail), div(ONE, out)));
    for (let s = 0; s < size - 1; s++) stationary.push(div(c, bail));
    stationary.push(div(c, out));
  }
  const piLast = stationary[size - 1] as Rational;

  // ---------------------------------------------------------------- components
  interface Component {
    readonly g: Group;
    readonly mix: Rational;
    readonly rung: number | null;
    readonly cause: 'flyers' | 'scarCard' | null;
  }
  const components: Component[] = [];
  for (const g of groups.values()) {
    if (g.flyers >= FLYERS_TO_TRIGGER) components.push({ g, mix: ONE, rung: triggerRung(g.flyers), cause: 'flyers' });
    else if (g.outcome === 'bailed') {
      components.push({ g, mix: sub(ONE, piLast), rung: null, cause: null });
      if (piLast.n !== 0n) components.push({ g, mix: piLast, rung: start.scarCard, cause: 'scarCard' });
    } else components.push({ g, mix: ONE, rung: null, cause: null });
  }

  // Exact, uncapped.
  let ex = ZERO;
  let ex2 = ZERO;
  const denR = rat(den);
  for (const c of components) {
    let s0 = 0n;
    let s1 = 0n;
    let s2 = 0n;
    for (const [coins, wt] of c.g.hist) {
      const b = BigInt(coins);
      s0 += wt;
      s1 += wt * b;
      s2 += wt * b * b;
    }
    let e1 = rat(s1);
    let e2 = rat(s2);
    if (c.rung !== null) {
      const sm = sessionMoments.get(c.rung) as { mean: Rational; second: Rational };
      e1 = add(e1, mul(rat(s0), sm.mean));
      e2 = add(e2, add(mul(rat(2n * s1), sm.mean), mul(rat(s0), sm.second)));
    }
    ex = add(ex, div(mul(c.mix, e1), denR));
    ex2 = add(ex2, div(mul(c.mix, e2), denR));
  }
  const rtpUncapped = div(ex, costR);

  // Float, capped. Prefix sums of each Session distribution.
  const prefix = new Map<number, { P0: Float64Array; P1: Float64Array; P2: Float64Array; T: Float64Array; d: SessionDistribution }>();
  for (const [r, d] of dists) {
    const P0 = new Float64Array(cap + 2);
    const P1 = new Float64Array(cap + 2);
    const P2 = new Float64Array(cap + 2);
    const T = new Float64Array(cap + 2);
    for (let x = 0; x <= cap; x++) {
      const p = d.p[x] as number;
      P0[x + 1] = (P0[x] as number) + p;
      P1[x + 1] = (P1[x] as number) + p * x;
      P2[x + 1] = (P2[x] as number) + p * x * x;
    }
    for (let x = cap; x >= 0; x--) T[x] = (T[x + 1] as number) + (d.p[x] as number);
    prefix.set(r, { P0, P1, P2, T, d });
  }
  const thresholds = WIN_HISTOGRAM_EDGES.map((e) => e * cost);
  let mean = 0;
  let second = 0;
  let hit = 0;
  let above = 0;
  let even = 0;
  let capP = 0;
  const atLeast = thresholds.map(() => 0);
  const split = { baseWays: 0, trickLandings: 0, sessionFromFlyers: 0, sessionFromScarCard: 0 };
  let maxWin = 0;
  const denF = Number(den);
  for (const c of components) {
    const mix = toNumber(c.mix);
    if (mix === 0) continue;
    const pre = c.rung === null ? null : (prefix.get(c.rung) as NonNullable<ReturnType<typeof prefix.get>>);
    const sm = c.rung === null ? null : (sessionMoments.get(c.rung) as { m: LadderMoments });
    const maxS = sm === null ? 0 : sm.m.maxA * ((w.values[w.values.length - 1] as number) ?? 0);
    for (const [b, wt] of c.g.hist) {
      const p = (mix * Number(wt)) / denF;
      if (p === 0) continue;
      if (c.g.outcome === 'landed') split.trickLandings += p * b;
      else split.baseWays += p * b;
      maxWin = Math.max(maxWin, Math.min(cap, b + maxS));
      if (pre === null || b >= cap) {
        const x = Math.min(b, cap);
        mean += p * x;
        second += p * x * x;
        if (x > 0) hit += p;
        if (x > cost) above += p;
        if (x === cost) even += p;
        if (x >= cap) capP += p;
        thresholds.forEach((t, i) => {
          if (x >= t) atLeast[i] = (atLeast[i] as number) + p;
        });
        continue;
      }
      const u = cap - b;
      const { P0, P1, P2, T, d } = pre;
      const eX = b * (P0[u] as number) + (P1[u] as number) + cap * (T[u] as number);
      mean += p * eX;
      second += p * (b * b * (P0[u] as number) + 2 * b * (P1[u] as number) + (P2[u] as number) + cap * cap * (T[u] as number));
      const sessionPart = p * (eX - b);
      if (c.cause === 'flyers') split.sessionFromFlyers += sessionPart;
      else split.sessionFromScarCard += sessionPart;
      // P(b + S ≥ t) = P(S ≥ t − b).
      const ge = (t: number): number => (t - b <= 0 ? 1 : (T[t - b] as number));
      hit += p * (b > 0 ? 1 : 1 - (d.p[0] as number));
      above += p * ge(cost + 1);
      even += p * (b <= cost ? (d.p[cost - b] as number) : 0);
      capP += p * (T[u] as number);
      thresholds.forEach((t, i) => {
        atLeast[i] = (atLeast[i] as number) + p * ge(t);
      });
    }
  }
  const variance = second - mean * mean;
  const sigma = Math.sqrt(Math.max(0, variance)) / cost;

  // P(payout = maxWin): the cap, or the exact top value.
  let maxWinP = 0;
  if (maxWin >= cap) maxWinP = capP;
  else {
    for (const c of components) {
      const mix = toNumber(c.mix);
      const pre = c.rung === null ? null : prefix.get(c.rung);
      for (const [b, wt] of c.g.hist) {
        const p = (mix * Number(wt)) / denF;
        if (pre === null || pre === undefined) maxWinP += b === maxWin ? p : 0;
        else if (maxWin - b >= 0) maxWinP += p * (pre.d.p[maxWin - b] as number);
      }
    }
  }

  const histogram = WIN_HISTOGRAM_LABELS.map((bucket, i) => {
    let probability: number;
    if (i === 0) probability = 1 - hit;
    else if (i === 1) probability = hit - (atLeast[0] as number);
    else if (i <= thresholds.length) probability = (atLeast[i - 2] as number) - (atLeast[i - 1] as number);
    else probability = atLeast[thresholds.length - 1] as number;
    return { bucket, probability };
  });

  // ---------------------------------------------------------------- long-run σ
  const sigmaLongRun = longRunSigma(components, size, piLast, prefix, den, cap, mean) / cost;

  // ---------------------------------------------------------------- rates and figures
  const trickRate = rat(kickerWeight, den);
  let landTotal = 0n;
  for (const a of tierAcc) landTotal += a.land;
  const flyerRate = (f: number): Rational => {
    let s = 0n;
    for (const g of groups.values()) if (g.flyers === f) for (const v of g.hist.values()) s += v;
    return rat(s, den);
  };
  let flyersAny = ZERO;
  for (let f = FLYERS_TO_TRIGGER; f <= 5; f++) flyersAny = add(flyersAny, flyerRate(f));
  const scarRate = mul(piLast, sub(bail, bailFlyers));
  const sessionRate = add(flyersAny, scarRate);

  const sessions: SessionFigures[] = triggers.map((t) => {
    const sm = sessionMoments.get(t.rung) as { m: LadderMoments; mean: Rational; second: Rational };
    const rate = t.trigger === 'scarCard' ? scarRate : flyerRate(Number(t.trigger.slice(-1)));
    const meanS = toNumber(sm.mean);
    return {
      trigger: t.trigger,
      startRung: t.rung,
      rate: toNumber(rate),
      meanWin: meanS / cost,
      sdWin: Math.sqrt(Math.max(0, toNumber(sub(sm.second, mul(sm.mean, sm.mean))))) / cost,
      meanSpins: toNumber(sm.m.spins),
      painLimitProbability: toNumber(sm.m.painEnd),
      zeroProbability: toNumber(sm.m.allZero),
      maxSpins: sm.m.maxSpins,
    };
  });

  const trickTiers: TrickTierFigures[] = tiers.map((t, i) => {
    const a = tierAcc[i] as (typeof tierAcc)[number];
    const landed = a.land === 0n ? null : a.land;
    return {
      id: t.id,
      attemptProbability: toNumber(rat(a.attempt, den)),
      landProbability: t.odds.land / (t.odds.land + t.odds.bail),
      meanWinWhenLanded: landed === null ? 0 : toNumber(rat(a.winLanded, landed)) / cost,
      meanPlainWinWhenLanded: landed === null ? 0 : toNumber(rat(a.plainLanded, landed)) / cost,
      wildReelSets: [...a.sets].map(([k, v]) => ({
        reels: k.split(',').map(Number),
        probability: landed === null ? 0 : toNumber(rat(v, landed)),
      })),
    };
  });

  const plainRtp = toNumber(rat(plainSum, den * BigInt(cost)));
  const plainSigma = Math.sqrt(Math.max(0, toNumber(sub(rat(plainSq, den), rat(plainSum * plainSum, den * den))))) / cost;
  // Uplift split: the plain win of every grid is the base game; the rest of the base win is the trick.
  const trickUplift = split.trickLandings - toNumber(rat(plainLandedSum, den));
  const rtp = mean / cost;
  const sessionSplit = split.sessionFromFlyers + split.sessionFromScarCard;

  let relativeError = 0;
  let sessionMeanCheck = 0;
  for (const [r, d] of dists) {
    relativeError = Math.max(relativeError, d.relativeErrorBound);
    let m = 0;
    d.p.forEach((p, x) => {
      m += p * x;
    });
    const exact = toNumber((sessionMoments.get(r) as { mean: Rational }).mean);
    // The truncated mean is below the exact one by at most what lies past the cap.
    if (exact > 0) sessionMeanCheck = Math.max(sessionMeanCheck, Math.abs(m - exact) / exact);
  }
  // Mixing and prefix sums add at most cap + 2 + (histogram cells) roundings to each figure.
  let cells = 0;
  for (const g of groups.values()) cells += g.hist.size;
  relativeError += (2 * cap + cells + 64) * 2 ** -53 * 1.01;
  const sigmaAbsolute = (relativeError * (second + mean * mean)) / (2 * Math.max(Math.sqrt(Math.max(variance, 0)), 1e-300)) / cost;

  return {
    label: 'theoretical',
    analyserVersion: ANALYSER_VERSION,
    configId: config.id,
    costCoins: cost,
    capCoins: cap,
    rtp: theo(rtp),
    rtpUncapped: theo(toNumber(rtpUncapped)),
    capReduction: theo(Math.max(0, toNumber(rtpUncapped) - rtp)),
    rtpSplit: theo({
      baseWays: split.baseWays / cost,
      trickLandings: split.trickLandings / cost,
      sessionFromFlyers: split.sessionFromFlyers / cost,
      sessionFromScarCard: split.sessionFromScarCard / cost,
    }),
    rtpSplitByUplift: theo({
      baseGame: (split.baseWays + split.trickLandings - trickUplift) / cost,
      trickUplift: trickUplift / cost,
      session: sessionSplit / cost,
    }),
    sigma: theo(sigma),
    sigmaLongRun: theo(sigmaLongRun),
    hitFrequency: theo(hit),
    winAboveBetFrequency: theo(above),
    evenMoneyFrequency: theo(even),
    ldwFrequency: theo(hit - above - even),
    trickRate: theo(toNumber(trickRate)),
    trickLandRate: theo(kickerWeight === 0n ? 0 : toNumber(rat(landTotal, kickerWeight))),
    sessionRate: theo(toNumber(sessionRate)),
    capProbability: theo(capP),
    maxWin: theo({ coins: maxWin, timesBet: maxWin / cost, probability: maxWinP }),
    winDistribution: theo(histogram),
    trickTiers: theo(trickTiers),
    sessions: theo(sessions),
    scarCard: theo({
      size,
      bailProbability: toNumber(bail),
      bailWithFlyersProbability: toNumber(bailFlyers),
      stationary: stationary.map(toNumber),
      betLevels: [...config.bet.levels],
    }),
    baseGame: theo({
      rtp: plainRtp,
      hitFrequency: toNumber(rat(plainHits, den)),
      sigma: plainSigma,
    }),
    exact: {
      rtpUncapped: toJson(rtpUncapped),
      secondMomentUncappedCoins2: toJson(ex2),
      trickRate: toJson(trickRate),
      sessionRate: toJson(sessionRate),
      scarCardStationaryLast: toJson(piLast),
    },
    floatError: { relative: relativeError, sigmaAbsolute, sessionMeanCheck },
    work: {
      baseCells: plain.cells.length,
      sessionSpinValues: w.values.length,
      ladderStates: [...dists.values()][0]?.states ?? 0,
      milliseconds: now() - started,
    },
  };
}

/**
 * The σ of a long run of consecutive paid spins: Var_π(X) + 2·Σₖ Cov(X₀, Xₖ), from the Scar
 * Card chain's fundamental matrix (Poisson's equation). A spin's payout depends on the card
 * only through whether a bail at size − 1 starts a Session, so g(s) = E[X | s] − μ is the
 * same for every s < size − 1.
 */
function longRunSigma(
  components: readonly {
    g: Group;
    mix: Rational;
    rung: number | null;
    cause: 'flyers' | 'scarCard' | null;
  }[],
  size: number,
  piLast: Rational,
  prefix: Map<number, { P0: Float64Array; P1: Float64Array; T: Float64Array }>,
  den: bigint,
  cap: number,
  mu: number,
): number {
  const denF = Number(den);
  // Per group: P, E[X·1], E[X²·1] with and without the Scar Card's Session.
  const condMean = (b: number, rung: number | null): number => {
    if (rung === null || b >= cap) return Math.min(b, cap);
    const pre = prefix.get(rung) as { P0: Float64Array; P1: Float64Array; T: Float64Array };
    const u = cap - b;
    return b * (pre.P0[u] as number) + (pre.P1[u] as number) + cap * (pre.T[u] as number);
  };
  // Moments of X under "normal" (no scar Session possible) and "last" (state size − 1).
  let bailP = 0;
  let bailNoFlyersP = 0;
  let xBailNormal = 0; // E[X·1{bail}] when no scar Session is possible
  let xBailNoFlyersLast = 0; // E[X·1{bail, < 3 Flyers}] at size − 1 (with the scar Session)
  let xBailNoFlyersNormal = 0;
  let meanNormal = 0;
  for (const c of components) {
    const g = c.g;
    for (const [b, wt] of g.hist) {
      const p = Number(wt) / denF;
      if (c.cause === 'scarCard') {
        xBailNoFlyersLast += p * condMean(b, c.rung);
        continue;
      }
      const x = p * condMean(b, c.rung);
      meanNormal += x;
      if (g.outcome === 'bailed') {
        bailP += p;
        xBailNormal += x;
        if (g.flyers < FLYERS_TO_TRIGGER) {
          bailNoFlyersP += p;
          xBailNoFlyersNormal += x;
        }
      }
    }
  }
  if (bailP === 0 || bailNoFlyersP === 0) return Math.sqrt(Math.max(0, secondFromComponents(components, prefix, den, cap) - mu * mu));
  const meanLast = meanNormal - xBailNoFlyersNormal + xBailNoFlyersLast;
  const pl = toNumber(piLast);
  const g = Array.from({ length: size }, (_, s) => (s === size - 1 ? meanLast : meanNormal) - mu);
  // P and the joint moments E[(X − μ)·1{s → s'} | s].
  const P: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const J: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let s = 0; s < size - 1; s++) {
    P[s]![s + 1]! += bailP;
    P[s]![s]! += 1 - bailP;
    J[s]![s + 1]! += xBailNormal - mu * bailP;
    J[s]![s]! += meanNormal - xBailNormal - mu * (1 - bailP);
  }
  const last = size - 1;
  P[last]![0]! += bailNoFlyersP;
  P[last]![last]! += 1 - bailNoFlyersP;
  J[last]![0]! += xBailNoFlyersLast - mu * bailNoFlyersP;
  J[last]![last]! += meanLast - xBailNoFlyersLast - mu * (1 - bailNoFlyersP);
  const pi = Array.from({ length: size }, (_, s) => (s === last ? pl : (1 - pl) / Math.max(1, size - 1)));
  // Solve (I − P + 1π) u = g.
  const A = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => (i === j ? 1 : 0) - (P[i]![j] as number) + (pi[j] as number)),
  );
  const u = solve(A, g);
  let cov = 0;
  for (let s = 0; s < size; s++) for (let t = 0; t < size; t++) cov += (pi[s] as number) * (J[s]![t] as number) * (u[t] as number);
  const variance = secondFromComponents(components, prefix, den, cap) - mu * mu;
  return Math.sqrt(Math.max(0, variance + 2 * cov));
}

function secondFromComponents(
  components: readonly { g: Group; mix: Rational; rung: number | null }[],
  prefix: Map<number, { P0: Float64Array; P1: Float64Array; T: Float64Array; P2?: Float64Array }>,
  den: bigint,
  cap: number,
): number {
  const denF = Number(den);
  let second = 0;
  for (const c of components) {
    const mix = toNumber(c.mix);
    for (const [b, wt] of c.g.hist) {
      const p = (mix * Number(wt)) / denF;
      if (c.rung === null || b >= cap) {
        const x = Math.min(b, cap);
        second += p * x * x;
        continue;
      }
      const pre = prefix.get(c.rung) as { P0: Float64Array; P1: Float64Array; T: Float64Array; P2: Float64Array };
      const u = cap - b;
      second += p * (b * b * (pre.P0[u] as number) + 2 * b * (pre.P1[u] as number) + (pre.P2[u] as number) + cap * cap * (pre.T[u] as number));
    }
  }
  return second;
}

/** Gaussian elimination with partial pivoting; A is small (the card's size). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i] as number]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}
