import { describe, expect, it } from 'vitest';
import {
  FOLK_VALLEY_CONFIG,
  PLACEHOLDER_CONFIG,
  analyse,
  bruteForceBase,
  initialPlayerState,
  ladderMoments,
  reelSweep,
  sessionSpinDistribution,
  sessionStartState,
  sortedCells,
  spinWithStreams,
  withScarCardMarks,
  type GameConfig,
  type Rational,
} from '../../src/engine';
import { add, div, mul, rat, sub, toNumber } from '../../src/engine/rational';
import { drawTree } from '../support/draw-tree';

/**
 * The analyser against exact references (math-targets 6.2, "Toy exact"): every sweep against
 * brute force, and a tiny configuration whose every possible paid spin is walked through the
 * real `spin` code with its exact probability. Equality is exact for the uncapped figures,
 * which the analyser keeps as fractions, and within the stated float bound for the rest.
 */

const ZERO = rat(0);

/** The shipped configuration's report, once for the file (about four seconds). */
const shipped = analyse(FOLK_VALLEY_CONFIG);

describe('base sweep', () => {
  // The placeholder with 8-stop strips: 32,768 combinations, enough to exercise 3-row ways.
  const short: GameConfig = {
    ...PLACEHOLDER_CONFIG,
    reels: PLACEHOLDER_CONFIG.reels.map((s) => s.slice(0, 8)),
  };

  it('equals brute force over every combination of distinct windows', () => {
    expect(sortedCells(reelSweep(short, short.reels))).toEqual(sortedCells(bruteForceBase(short, short.reels)));
  });

  it('equals brute force with reels turned wild, and untracked', () => {
    for (const wild of [[1], [2, 3], [1, 2, 3]]) {
      expect(sortedCells(reelSweep(short, short.reels, wild))).toEqual(sortedCells(bruteForceBase(short, short.reels, wild)));
    }
    expect(sortedCells(reelSweep(short, short.reels, [], false))).toEqual(
      sortedCells(bruteForceBase(short, short.reels, [], false)),
    );
  });

  it('weighs every stop combination once', () => {
    const sweep = reelSweep(FOLK_VALLEY_CONFIG, FOLK_VALLEY_CONFIG.reels);
    expect(sweep.cells.reduce((a, c) => a + c.weight, 0)).toBe(sweep.total);
    expect(sweep.total).toBe(FOLK_VALLEY_CONFIG.reels.reduce((a, s) => a * s.length, 1));
  });
});

// ----------------------------------------------------------------------------- the toy

/**
 * Four reels of one row, so every paid spin's draw tree is small enough to walk: 108 base
 * stop combinations, one rider, three tiers (the hard one turns all three wild-eligible
 * reels wild), a two-mark Scar Card, and a Session of two spins plus one per bail on Session
 * strips with two stop combinations. Flyers on every reel, so 3 and 4 Flyers both happen,
 * and on reel 2 beside a Kicker, so a filling bail can meet 3 Flyers (DR-012's held mark).
 * The cap is 10× a 2-coin spin, so it binds, and some base wins pass it on their own.
 */
function toy(maxWinMultiplier: number): GameConfig {
  const c = {
    ...PLACEHOLDER_CONFIG,
    id: `toy-exact-${maxWinMultiplier}`,
    grid: { reels: 4, rows: 1 },
    bet: { coinsPerSpin: 2, levels: [1, 5] },
    symbols: [
      { id: 'gramps', kind: 'rider' },
      { id: 'bolt', kind: 'low' },
      { id: 'kicker', kind: 'wild' },
      { id: 'flyer', kind: 'scatter' },
    ],
    paytable: { gramps: { 3: 4, 4: 9, 5: 9 }, bolt: { 3: 1, 4: 3, 5: 3 } },
    reels: [
      ['gramps', 'bolt', 'flyer'],
      ['gramps', 'kicker', 'flyer'],
      ['bolt', 'kicker', 'flyer', 'gramps'],
      ['gramps', 'bolt', 'flyer'],
    ],
    riders: [{ id: 'gramps', discipline: 'bmx', weight: 1 }],
    trickTiers: [
      { id: 'easy', weight: 2, odds: { land: 1, bail: 1 }, landing: { extraWildReels: 0, winMultiplier: 1 } },
      { id: 'medium', weight: 1, odds: { land: 1, bail: 2 }, landing: { extraWildReels: 1, winMultiplier: 2 } },
      { id: 'hard', weight: 1, odds: { land: 1, bail: 3 }, landing: { extraWildReels: 2, winMultiplier: 3 } },
    ],
    scarCard: { size: 2, persistence: 'per-bet-level' },
    session: {
      startingSpins: 2,
      startRung: { flyers3: 0, flyers4: 1, flyers5: 2, scarCard: 0 },
      rungs: [
        { multiplier: 1, odds: { land: 1, bail: 1 }, trickTier: 'easy' },
        { multiplier: 2, odds: { land: 1, bail: 2 }, trickTier: 'easy' },
        { multiplier: 3, odds: { land: 2, bail: 1 }, trickTier: 'medium' },
      ],
      painLimit: 3,
      extraSpinsPerBail: 1,
      reels: [['gramps', 'bolt'], ['gramps'], ['kicker'], ['gramps']],
    },
    maxWinMultiplier,
  };
  return c as unknown as GameConfig;
}

interface StateFigures {
  mean: Rational;
  second: Rational;
  hit: Rational;
  above: Rational;
  ldw: Rational;
  cap: Rational;
  attempt: Rational;
  session: Rational;
  toNext: Rational;
  /** By the card after the spin: P, E[X·1], E[X²·1]. */
  byNext: Map<number, { p: Rational; x: Rational; x2: Rational }>;
  split: { base: Rational; landed: Rational; flyers: Rational; card: Rational };
}

/** Every paid spin from a card holding `marks`, through `spinWithStreams`. */
function enumerate(config: GameConfig, marks: number): StateFigures {
  const state = withScarCardMarks(initialPlayerState(config), 1, marks);
  const request = { masterSeed: '0000000000000000', spinIndex: 0, betLevel: 1 };
  const cost = config.bet.coinsPerSpin;
  const f: StateFigures = {
    mean: ZERO,
    second: ZERO,
    hit: ZERO,
    above: ZERO,
    ldw: ZERO,
    cap: ZERO,
    attempt: ZERO,
    session: ZERO,
    toNext: ZERO,
    byNext: new Map(),
    split: { base: ZERO, landed: ZERO, flyers: ZERO, card: ZERO },
  };
  for (const { result: r, p } of drawTree((streams) => spinWithStreams(config, state, request, streams).result)) {
    const x = r.totalWinCoins;
    f.mean = add(f.mean, mul(p, rat(x)));
    f.second = add(f.second, mul(p, rat(x * x)));
    if (x > 0) f.hit = add(f.hit, p);
    if (x > cost) f.above = add(f.above, p);
    if (x > 0 && x < cost) f.ldw = add(f.ldw, p);
    if (r.capped) f.cap = add(f.cap, p);
    if (r.base.attempt !== null) f.attempt = add(f.attempt, p);
    if (r.session !== null) f.session = add(f.session, p);
    if (r.scarCard.after !== marks) f.toNext = add(f.toNext, p);
    const t = f.byNext.get(r.scarCard.after) ?? { p: ZERO, x: ZERO, x2: ZERO };
    f.byNext.set(r.scarCard.after, { p: add(t.p, p), x: add(t.x, mul(p, rat(x))), x2: add(t.x2, mul(p, rat(x * x))) });
    const baseCoins = rat(r.base.winCoins);
    if (r.base.attempt?.outcome === 'landed') f.split.landed = add(f.split.landed, mul(p, baseCoins));
    else f.split.base = add(f.split.base, mul(p, baseCoins));
    if (r.session !== null) {
      const s = mul(p, rat(r.session.totalWinCoins));
      if (r.session.trigger.kind === 'flyers') f.split.flyers = add(f.split.flyers, s);
      else f.split.card = add(f.split.card, s);
    }
  }
  return f;
}

/** Long-run figures of the two-mark card: π₁ = P(0→1) / (P(0→1) + P(1→0)). */
function stationaryToy(config: GameConfig): {
  pi1: Rational;
  states: StateFigures[];
  mix: (pick: (f: StateFigures) => Rational) => Rational;
} {
  const cached = toyCache.get(config);
  if (cached !== undefined) return cached;
  const s0 = enumerate(config, 0);
  const s1 = enumerate(config, 1);
  const pi1 = div(s0.toNext, add(s0.toNext, s1.toNext));
  const pi0 = sub(rat(1), pi1);
  const result = { pi1, states: [s0, s1], mix: (pick: (f: StateFigures) => Rational) => add(mul(pi0, pick(s0)), mul(pi1, pick(s1))) };
  toyCache.set(config, result);
  return result;
}
const toyCache = new Map<GameConfig, ReturnType<typeof stationaryToy>>();

describe('toy configuration, every paid spin walked exactly', () => {
  const capped = toy(10);
  const uncapped = toy(1_000_000);
  const cost = rat(2);

  it('matches the uncapped mean, second moment and rates as exact fractions', () => {
    const { pi1, mix } = stationaryToy(uncapped);
    const report = analyse(uncapped);
    const rtp = div(mix((f) => f.mean), cost);
    expect(report.exact.rtpUncapped.numerator).toBe(rtp.n.toString());
    expect(report.exact.rtpUncapped.denominator).toBe(rtp.d.toString());
    const second = mix((f) => f.second);
    expect(report.exact.secondMomentUncappedCoins2.numerator).toBe(second.n.toString());
    expect(report.exact.secondMomentUncappedCoins2.denominator).toBe(second.d.toString());
    const session = mix((f) => f.session);
    expect([report.exact.sessionRate.numerator, report.exact.sessionRate.denominator]).toEqual([session.n.toString(), session.d.toString()]);
    expect([report.exact.scarCardStationaryLast.numerator, report.exact.scarCardStationaryLast.denominator]).toEqual([
      pi1.n.toString(),
      pi1.d.toString(),
    ]);
    const attempt = mix((f) => f.attempt);
    expect([report.exact.trickRate.numerator, report.exact.trickRate.denominator]).toEqual([attempt.n.toString(), attempt.d.toString()]);
    expect(report.capProbability.value).toBe(0);
  });

  it('matches every capped figure within the float bound', () => {
    const { mix } = stationaryToy(capped);
    const report = analyse(capped);
    const close = (actual: number, exact: Rational, label: string): void => {
      const e = toNumber(exact);
      expect(Math.abs(actual - e), label).toBeLessThanOrEqual(report.floatError.relative * Math.max(1, Math.abs(e)) + 1e-15);
    };
    const mean = mix((f) => f.mean);
    close(report.rtp.value, div(mean, cost), 'rtp');
    close(report.hitFrequency.value, mix((f) => f.hit), 'hit');
    close(report.winAboveBetFrequency.value, mix((f) => f.above), 'above bet');
    close(report.ldwFrequency.value, mix((f) => f.ldw), 'ldw');
    close(report.capProbability.value, mix((f) => f.cap), 'cap');
    const variance = sub(mix((f) => f.second), mul(mean, mean));
    expect(Math.abs(report.sigma.value - Math.sqrt(toNumber(variance)) / 2)).toBeLessThan(1e-9);
    close(report.rtpSplit.value.baseWays, div(mix((f) => f.split.base), cost), 'split base');
    close(report.rtpSplit.value.trickLandings, div(mix((f) => f.split.landed), cost), 'split trick');
    close(report.rtpSplit.value.sessionFromFlyers, div(mix((f) => f.split.flyers), cost), 'split flyers');
    close(report.rtpSplit.value.sessionFromScarCard, div(mix((f) => f.split.card), cost), 'split card');
    // The cap binds in this toy, and the analyser says by how much.
    expect(report.capProbability.value).toBeGreaterThan(0.01);
    expect(report.rtp.value).toBeLessThan(report.rtpUncapped.value);
    const sum = report.rtpSplit.value;
    // Like the statistics, the split counts a base win past the cap in full, so here it is above the RTP.
    expect(sum.baseWays + sum.trickLandings + sum.sessionFromFlyers + sum.sessionFromScarCard).toBeGreaterThan(report.rtp.value);
  });

  it('gives the long-run σ that Var(ΣX)/T converges to, by a forward pass over T spins', () => {
    // Independent of the analyser's fundamental-matrix formula: carry P(card), E[S·1] and
    // E[S²·1] for the running total S over T spins from the stationary card, then Var(S_T)/T.
    const { pi1, states } = stationaryToy(capped);
    const report = analyse(capped);
    let v = [
      { p: 1 - toNumber(pi1), m1: 0, m2: 0 },
      { p: toNumber(pi1), m1: 0, m2: 0 },
    ];
    const T = 4000;
    for (let t = 0; t < T; t++) {
      const next = [0, 1].map(() => ({ p: 0, m1: 0, m2: 0 }));
      states.forEach((st, s) => {
        const from = v[s]!;
        for (const [to, m] of st.byNext) {
          const q = toNumber(m.p);
          const a = toNumber(m.x);
          const b = toNumber(m.x2);
          const n = next[to]!;
          n.p += from.p * q;
          n.m1 += from.m1 * q + from.p * a;
          n.m2 += from.m2 * q + 2 * from.m1 * a + from.p * b;
        }
      });
      v = next;
    }
    const m1 = v[0]!.m1 + v[1]!.m1;
    const m2 = v[0]!.m2 + v[1]!.m2;
    const sigmaT = Math.sqrt((m2 - m1 * m1) / T) / 2;
    // The finite-T value approaches the limit as O(1/T).
    expect(Math.abs(sigmaT - report.sigmaLongRun.value) / report.sigmaLongRun.value).toBeLessThan(1e-3);
    expect(Math.abs(report.sigmaLongRun.value - report.sigma.value)).toBeGreaterThan(1e-3);
  });

  it('includes the held-mark transition (DR-012)', () => {
    const report = analyse(capped);
    expect(report.scarCard.value.bailWithFlyersProbability).toBeGreaterThan(0);
    const s = report.scarCard.value.stationary;
    expect(s[0]! + s[1]!).toBeCloseTo(1, 15);
    // The held mark keeps the card at size − 1 longer, so π₁ > π₀ here.
    expect(s[1]!).toBeGreaterThan(s[0]!);
  });
});

describe('Session ladder', () => {
  it('has exact moments that agree with the float distribution', () => {
    const report = shipped;
    expect(report.floatError.sessionMeanCheck).toBeLessThanOrEqual(report.floatError.relative);
    const w = sessionSpinDistribution(FOLK_VALLEY_CONFIG);
    const m = ladderMoments(FOLK_VALLEY_CONFIG, w.pZero)(sessionStartState(FOLK_VALLEY_CONFIG, 0));
    // E[S] = E[W]·E[Σm]: the mean Session win in the report is that product.
    expect(report.sessions.value[0]!.meanWin).toBeCloseTo(toNumber(mul(w.mean, m.a)) / 20, 12);
    expect(m.painEnd.n > 0n).toBe(true);
  });
});

describe('the shipped configuration (DR-013)', () => {
  const r = shipped;

  it('meets DR-006', () => {
    expect(Math.abs(r.rtp.value - 0.96)).toBeLessThanOrEqual(0.0005);
    expect(r.sigma.value).toBeGreaterThanOrEqual(4);
    expect(r.sigma.value).toBeLessThanOrEqual(7);
    expect(r.hitFrequency.value).toBeGreaterThanOrEqual(0.28);
    expect(r.hitFrequency.value).toBeLessThanOrEqual(0.35);
    expect(1 / r.trickRate.value).toBeGreaterThanOrEqual(8);
    expect(1 / r.trickRate.value).toBeLessThanOrEqual(12);
    expect(1 / r.sessionRate.value).toBeGreaterThanOrEqual(120);
    expect(1 / r.sessionRate.value).toBeLessThanOrEqual(200);
    expect(r.capCoins).toBe(2500 * 20);
    expect(r.maxWin.value.timesBet).toBeLessThanOrEqual(2500);
    expect(r.winAboveBetFrequency.value).toBeGreaterThanOrEqual(0.12);
    expect(r.ldwFrequency.value).toBeLessThanOrEqual(r.hitFrequency.value / 2);
  });

  it('pins the tuned figures', () => {
    // Any change to the configuration or the analyser that moves these is a retune: record it.
    expect(r.configId).toBe('folk-valley-96-v1');
    expect(r.rtp.value).toBeCloseTo(0.95997277501, 10);
    expect(r.exact.rtpUncapped.value).toBeCloseTo(0.95997277501, 10);
    expect(r.sigma.value).toBeCloseTo(5.715258, 5);
    expect(r.hitFrequency.value).toBeCloseTo(0.3115647, 6);
    const split = r.rtpSplitByUplift.value;
    expect(split.baseGame + split.trickUplift + split.session).toBeCloseTo(r.rtp.value, 12);
    expect(split.baseGame).toBeCloseTo(0.5548, 4);
    expect(split.trickUplift).toBeCloseTo(0.1319, 4);
    expect(split.session).toBeCloseTo(0.2733, 4);
  });

  it('labels every figure theoretical', () => {
    expect(r.label).toBe('theoretical');
    for (const [key, value] of Object.entries(r)) {
      if (typeof value === 'object' && value !== null && 'kind' in value) expect(value.kind, key).toBe('theoretical');
    }
  });

  it('gives a histogram that sums to one', () => {
    const total = r.winDistribution.value.reduce((a, b) => a + b.probability, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(r.winDistribution.value[0]!.probability).toBeCloseTo(1 - r.hitFrequency.value, 12);
  });
});
