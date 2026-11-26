import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_CONFIG,
  StatsAccumulator,
  WIN_HISTOGRAM_LABELS,
  addSpin,
  emptyStats,
  mergeAllStats,
  mergeStats,
  runSimulation,
  summarise,
  wideToBigInt,
  withTheoretical,
} from '../../src/engine';
import type { SessionResult, SessionSpin, SimulationStats, SpinResult, Theoretical } from '../../src/engine';
import { spin as fakeSpin } from '../support/fake-spin';
import { SEED, attempt, makeResult } from '../support/results';

function statsOf(results: readonly SpinResult[]): SimulationStats {
  const acc = new StatsAccumulator();
  for (const r of results) acc.add(r);
  return acc.snapshot();
}

function sessionSpin(index: number, outcome: 'landed' | 'bailed', rung: number, pain: number, win: number): SessionSpin {
  return {
    index,
    stops: [],
    grid: [],
    attempt: {
      rider: 'dot',
      rung,
      trickId: 't',
      outcome,
      bail: outcome === 'bailed' ? { animationId: 'a', injury: { level: 'scuffed', id: 'scrape' } } : null,
    },
    ladderBefore: { rung, multiplier: 1, pain },
    ladderAfter: { rung: outcome === 'landed' ? rung + 1 : rung, multiplier: outcome === 'landed' ? 2 : 1, pain: outcome === 'bailed' ? pain + 1 : pain },
    spinsLeftBefore: 1,
    spinsAdded: 0,
    spinsLeftAfter: 0,
    wins: [],
    winCoins: win,
    runningTotalCoins: win,
  };
}

function session(trigger: SessionResult['trigger'], spins: SessionSpin[], total: number): SessionResult {
  return {
    trigger,
    rider: 'dot',
    startingSpins: spins.length,
    startRung: 0,
    spins,
    endReason: 'spins-out',
    closing: { level: 'patched-up', id: 'cast' },
    totalWinCoins: total,
  };
}

const fakeJob = (count: number, startIndex = 0) => ({
  masterSeed: SEED,
  startIndex,
  count,
  betLevel: 1,
  laneLength: 1000,
  initialState: null,
});

describe('stats: hand-computed values', () => {
  // Cost 20 coins; wins 0, 0, 10, 20, 60, 0 coins, so 0, 0, 0.5, 1, 3, 0 × bet.
  const results = [0, 0, 10, 20, 60, 0].map((win, i) => makeResult(i, win));
  const stats = statsOf(results);
  const summary = summarise(stats);

  it('counts bet, win and every kind of hit', () => {
    expect(stats.spins).toBe(6);
    expect(stats.totalBetCoins).toBe(120);
    expect(stats.totalWinCoins).toBe(90);
    expect(wideToBigInt(stats.sumSquaredWinCoins)).toBe(100n + 400n + 3600n);
    expect(stats.hits).toBe(3);
    expect(stats.lossesDisguisedAsWins).toBe(1); // 10 < 20
    expect(stats.evenMoney).toBe(1); // 20 = 20
    expect(stats.winsAboveBet).toBe(1); // 60 > 20
    expect(stats.maxWin).toEqual({ coins: 60, spinIndex: 4 });
    expect(stats.drought).toEqual({ leading: 2, trailing: 1, longest: 2 });
  });

  it('derives RTP, σ, its standard error and the interval', () => {
    expect(summary.rtp.value).toBeCloseTo(0.75, 15);
    // Σx² = 10.25 and mean 0.75, so s² = (10.25 − 6 · 0.5625) / 5 = 1.375.
    expect(summary.sigma.value).toBeCloseTo(Math.sqrt(1.375), 12);
    expect(summary.rtpStandardError).toBeCloseTo(Math.sqrt(1.375 / 6), 12);
    const se = Math.sqrt(1.375 / 6);
    expect(summary.rtpInterval95?.low).toBeCloseTo(0.75 - 1.96 * se, 12);
    expect(summary.rtpInterval95?.high).toBeCloseTo(0.75 + 1.96 * se, 12);
    expect(summary.rtpInterval95?.method).toBe('normal-approximation');
    expect(summary.hitFrequency.value).toBe(0.5);
    expect(summary.ldwFrequency.value).toBeCloseTo(1 / 6, 15);
    expect(summary.winAboveBetFrequency.value).toBeCloseTo(1 / 6, 15);
    expect(summary.netCoins).toBe(-30);
    expect(summary.largestObservedWin).toEqual({ coins: 60, timesBet: 3, spinIndex: 4 });
    expect(summary.longestDrought).toBe(2);
  });

  it('puts each win in its histogram bucket', () => {
    const byLabel = Object.fromEntries(summary.winHistogram.map((b) => [b.bucket, b.count]));
    expect(byLabel).toMatchObject({ '0': 3, '(0, 1)': 1, '[1, 2)': 1, '[2, 5)': 1, '[5, 10)': 0, '2500+': 0 });
    expect(summary.winHistogram).toHaveLength(WIN_HISTOGRAM_LABELS.length);
    expect(statsOf([makeResult(0, 50_000)]).winHistogram.at(-1)).toBe(1); // exactly 2,500 × 20
    expect(statsOf([makeResult(0, 49_999)]).winHistogram.at(-2)).toBe(1);
  });

  it('labels every figure observed and leaves the theoretical slot empty', () => {
    for (const key of ['rtp', 'sigma', 'hitFrequency', 'winAboveBetFrequency', 'ldwFrequency', 'trickRate', 'sessionRate', 'capProbability', 'rtpSplit'] as const) {
      expect(summary[key].kind).toBe('observed');
      expect(summary[key].theoretical).toBeNull();
    }
    expect(summary.label).toBe('observed');
  });
});

describe('stats: tricks, the Scar Card, Sessions and injuries', () => {
  const results = [
    makeResult(10, 40, { attempt: attempt('easy', 'landed') }),
    makeResult(11, 60, {
      baseWin: 0,
      attempt: attempt('medium', 'bailed'),
      scar: { before: 4, after: 0, filled: true },
      session: session({ kind: 'scar-card' }, [sessionSpin(0, 'landed', 0, 0, 60)], 60),
    }),
    makeResult(12, 80, {
      baseWin: 0,
      session: session({ kind: 'flyers', count: 4 }, [sessionSpin(0, 'bailed', 0, 0, 0), sessionSpin(1, 'landed', 0, 1, 80)], 80),
    }),
    makeResult(13, 50_000, { capped: true }),
  ];
  const stats = statsOf(results);

  it('counts trick attempts by outcome and tier', () => {
    expect(stats.tricks).toMatchObject({ attempts: 2, landed: 1, bailed: 1 });
    expect(stats.tricks.byTier).toEqual({
      easy: { attempts: 1, landed: 1, bailed: 0 },
      medium: { attempts: 1, landed: 0, bailed: 1 },
      hard: { attempts: 0, landed: 0, bailed: 0 },
    });
    expect(stats.base).toEqual({ winCoins: 50_040, winCoinsOnLanding: 40 });
  });

  it('counts marks, fills and Sessions by cause, length, multiplier and rung', () => {
    expect(stats.scarCard).toEqual({ marksAdded: 1, fills: 1 });
    expect(stats.sessions.triggers).toEqual({ flyers3: 0, flyers4: 1, flyers5: 0, scarCard: 1 });
    expect(stats.sessions.spins).toBe(3);
    expect(stats.sessions.winCoins).toBe(140);
    expect(stats.sessions.winCoinsFromFlyers).toBe(80);
    expect(stats.sessions.winCoinsFromScarCard).toBe(60);
    expect(stats.sessions.attempts).toEqual({ attempts: 3, landed: 2, bailed: 1 });
    expect(stats.sessions.endReasons).toEqual({ 'spins-out': 2, 'pain-limit': 0, 'max-win': 0 });
    expect(stats.sessions.lengths).toEqual({ '1': 1, '2': 1 });
    expect(stats.sessions.finalMultipliers).toEqual({ '2': 2 });
    expect(stats.sessions.finalRungs).toEqual({ '1': 2 });
  });

  it('counts every injury card shown, closing cards included', () => {
    expect(stats.injuries).toEqual({ scuffed: 2, bleeding: 0, broken: 0, 'patched-up': 2 });
  });

  it('counts the cap and splits RTP by part', () => {
    expect(stats.capped).toBe(1);
    const s = summarise(stats);
    expect(s.capProbability.value).toBe(0.25);
    expect(s.sessionRate.value).toBe(0.5);
    expect(s.trickRate.value).toBe(0.5);
    expect(s.trickLandRate.value).toBe(0.5);
    expect(s.rtpSplit.value).toEqual({ baseWays: 50_000 / 80, trickLandings: 40 / 80, sessionFromFlyers: 1, sessionFromScarCard: 60 / 80 });
  });
});

describe('stats: refusals and exactness', () => {
  it('refuses spins out of order, or of another seed, config or cost', () => {
    const acc = new StatsAccumulator();
    acc.add(makeResult(5, 0));
    expect(() => acc.add(makeResult(5, 0))).toThrow(/order/);
    expect(() => acc.add(makeResult(6, 0, { seed: 'fedcba9876543210' }))).toThrow(/seed/);
    expect(() => acc.add(makeResult(6, 0, { cost: 40 }))).toThrow(/cost/);
    expect(() => summarise(emptyStats())).toThrow(/No spins/);
  });

  it('keeps sums of squares exact beyond 2^53', () => {
    const big = 200_000_000; // far above any real win, to push Σw² past 2^53
    let stats = emptyStats();
    for (let i = 0; i < 300; i++) stats = addSpin(stats, makeResult(i, big + i));
    let expected = 0n;
    for (let i = 0; i < 300; i++) expected += BigInt(big + i) ** 2n;
    expect(expected > 2n ** 53n).toBe(true);
    expect(wideToBigInt(stats.sumSquaredWinCoins)).toBe(expected);
  });

  it('addSpin does not change its input', () => {
    const before = emptyStats();
    const copy = JSON.parse(JSON.stringify(before)) as SimulationStats;
    addSpin(before, makeResult(0, 10));
    expect(before).toEqual(copy);
  });

  it('survives a JSON round trip unchanged', () => {
    const { stats } = runSimulation(fakeSpin, PLACEHOLDER_CONFIG, fakeJob(500));
    expect(JSON.parse(JSON.stringify(stats))).toEqual(stats);
  });
});

describe('mergeStats', () => {
  const N = 3000;
  const results: SpinResult[] = [];
  {
    // The fake spin's results, played in order with the card carried over.
    let state = { scarCards: { '1': 0, '2': 0, '5': 0, '10': 0, '25': 0 } } as { scarCards: { [k: string]: number } };
    for (let i = 0; i < N; i++) {
      const out = fakeSpin(PLACEHOLDER_CONFIG, state, { masterSeed: SEED, spinIndex: i, betLevel: 1 });
      results.push(out.result);
      state = out.state as typeof state;
    }
  }
  const whole = statsOf(results);

  it('the fake spin exercises every counter', () => {
    expect(whole.hits).toBeGreaterThan(0);
    expect(whole.lossesDisguisedAsWins).toBeGreaterThan(0);
    expect(whole.evenMoney).toBeGreaterThan(0);
    expect(whole.tricks.landed).toBeGreaterThan(0);
    expect(whole.tricks.bailed).toBeGreaterThan(0);
    expect(whole.scarCard.fills).toBeGreaterThan(0);
    expect(whole.sessions.triggers.scarCard).toBeGreaterThan(0);
    expect(whole.sessions.triggers.flyers3 + whole.sessions.triggers.flyers4 + whole.sessions.triggers.flyers5).toBeGreaterThan(0);
    expect(whole.sessions.endReasons['pain-limit']).toBeGreaterThan(0);
    expect(whole.injuries.broken).toBeGreaterThan(0);
    expect(whole.capped).toBeGreaterThan(0);
  });

  it('two parts at any cut merge to exactly the whole', () => {
    for (const cut of [0, 1, 2, 17, 999, 1500, N - 1, N]) {
      const merged = mergeStats(statsOf(results.slice(0, cut)), statsOf(results.slice(cut)));
      expect(merged).toEqual(whole);
      expect(JSON.stringify(merged)).toBe(JSON.stringify(whole));
    }
  });

  it('many parts merge to exactly the whole, grouped either way', () => {
    const cuts = [0, 3, 250, 251, 1200, 2999, N];
    const parts = cuts.slice(1).map((end, i) => statsOf(results.slice(cuts[i], end)));
    expect(mergeAllStats(parts)).toEqual(whole);
    const [a, b, c, ...rest] = parts as [SimulationStats, SimulationStats, SimulationStats, ...SimulationStats[]];
    const left = mergeStats(mergeStats(a, b), c);
    const right = mergeStats(a, mergeStats(b, c));
    expect(left).toEqual(right);
    expect(mergeAllStats([left, ...rest])).toEqual(whole);
  });

  it('finds the longest drought across part boundaries', () => {
    // Pay pattern chosen so the longest dry run straddles two cuts.
    const wins = [5, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0, 0];
    const rs = wins.map((w, i) => makeResult(i, w));
    const all = statsOf(rs);
    expect(all.drought).toEqual({ leading: 0, trailing: 3, longest: 7 });
    for (let x = 0; x <= wins.length; x++) {
      for (let y = x; y <= wins.length; y++) {
        const merged = mergeAllStats([statsOf(rs.slice(0, x)), statsOf(rs.slice(x, y)), statsOf(rs.slice(y))]);
        expect(merged.drought).toEqual(all.drought);
      }
    }
    expect(statsOf(wins.map((_, i) => makeResult(i, 0))).drought).toEqual({ leading: 15, trailing: 15, longest: 15 });
  });

  it('keeps the earliest of equal max wins, whichever way it merges', () => {
    const a = statsOf([makeResult(0, 60), makeResult(1, 10)]);
    const b = statsOf([makeResult(2, 60)]);
    expect(mergeStats(a, b).maxWin).toEqual({ coins: 60, spinIndex: 0 });
  });

  it('refuses parts that overlap, are out of order or come from another run', () => {
    const a = statsOf(results.slice(0, 10));
    const b = statsOf(results.slice(5, 20));
    expect(() => mergeStats(a, b)).toThrow(/order/);
    expect(() => mergeStats(statsOf(results.slice(10, 20)), a)).toThrow(/order/);
    expect(() => mergeStats(a, statsOf([makeResult(50, 0, { seed: 'fedcba9876543210' })]))).toThrow(/merge/);
  });
});

describe('withTheoretical', () => {
  const summary = summarise(statsOf([makeResult(0, 10), makeResult(1, 30)]));
  const rtp: Theoretical<number> = { kind: 'theoretical', value: 0.96 };

  it('fills only the slots it is given, and leaves the observed values alone', () => {
    const paired = withTheoretical(summary, { rtp });
    expect(paired.rtp).toEqual({ kind: 'observed', value: 1, theoretical: rtp });
    expect(paired.sigma.theoretical).toBeNull();
    expect(paired.sigma.value).toBe(summary.sigma.value);
    expect(summary.rtp.theoretical).toBeNull(); // the input is unchanged
  });

  it('refuses a value that is not labelled theoretical', () => {
    const fake = { kind: 'observed', value: 0.96 } as unknown as Theoretical<number>;
    expect(() => withTheoretical(summary, { rtp: fake })).toThrow(/theoretical/);
  });
});
