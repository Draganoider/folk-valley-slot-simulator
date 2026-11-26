import { describe, expect, it } from 'vitest';
import {
  FOLK_VALLEY_CONFIG,
  analyse,
  assertWithinTolerance,
  bernoulliSigma,
  drawStops,
  evaluateWays,
  formatSeed,
  gridFromStops,
  initialPlayerState,
  reelSweep,
  resolveSession,
  runSimulation,
  seedFromText,
  spin,
  spinStreams,
  spinWithStreams,
  summarise,
  sweepCellOfGrid,
  type Rng,
  type SpinResult,
  type SpinStreams,
  type Theoretical,
  withScarCardMarks,
} from '../../src/engine';

/**
 * The engine against the analyser on the shipped configuration (math-targets 6.2):
 *
 * - **Same stops.** For hand-picked stops and trick draws, and for every spin of a seeded run,
 *   the coins `spin` paid equal the analyser's evaluation of the same grid, and that grid's
 *   cell is one the analyser's sweep weighs.
 * - **Short seeded simulations** of each part and of the whole game, each within 4·σ/√N of
 *   the analyser's value with the analyser's σ (DR-006). Fixed, recorded seeds: a failure is a
 *   finding to investigate, never a reason to change the seed. Long runs are in the nightly job.
 */

const config = FOLK_VALLEY_CONFIG;
const report = analyse(config);
const cost = config.bet.coinsPerSpin;
const theo = (value: number): Theoretical<number> => ({ kind: 'theoretical', value });

/** An outcome stream that answers from a list, then fails: a hand-picked spin. */
function fixed(values: readonly number[]): Rng {
  let i = 0;
  const next = (): number => {
    if (i >= values.length) throw new Error('The hand-picked spin drew more than it scripted.');
    return values[i++] as number;
  };
  return { nextUint32: next, nextInt: next, pickWeighted: next };
}
const zero: Rng = { nextUint32: () => 0, nextInt: () => 0, pickWeighted: () => 0 };

/** The stops of the first window of each reel that satisfies `want`, from stop 0. */
function stopsWhere(want: (reel: number, window: readonly string[]) => boolean): number[] {
  return config.reels.map((strip, reel) => {
    for (let s = 0; s < strip.length; s++) {
      const w = [0, 1, 2].map((r) => strip[(s + r) % strip.length] as string);
      if (want(reel, w)) return s;
    }
    throw new Error(`No window on reel ${reel + 1} fits.`);
  });
}

function checkAgainstAnalyser(r: SpinResult): void {
  const wild = r.base.attempt?.wildReels ?? [];
  const cell = sweepCellOfGrid(config, r.base.grid, wild);
  expect(cell.coins * (r.base.attempt?.winMultiplier ?? 1)).toBe(r.base.winCoins);
  expect(cell.flyers).toBe(r.base.flyers.count);
  expect(cell.kicker).toBe(r.base.attempt === null ? -1 : r.base.attempt.kicker.reel);
  for (const sp of r.session?.spins ?? []) {
    const uncut = sweepCellOfGrid(config, sp.grid, [], false).coins * sp.ladderAfter.multiplier;
    if (r.session?.endReason === 'max-win' && sp.index === (r.session.spins.length - 1)) expect(sp.winCoins).toBeLessThanOrEqual(uncut);
    else expect(sp.winCoins).toBe(uncut);
  }
}

describe('engine equals analyser on the same stops', () => {
  it('hand-picked spins: a landed hard trick, a bail with Flyers, and a plain spin', () => {
    const state = initialPlayerState(config);
    const request = { masterSeed: '0000000000000000', spinIndex: 0, betLevel: 1 };
    // Kickers on reels 2–4 (the leftmost, reel 2, starts the attempt), Flyers where they fit.
    const kickerStops = stopsWhere((reel, w) => (reel >= 1 && reel <= 3 ? w.includes('kicker') : w.includes('gramps')));
    const hardTier = 2;
    // Stops, rider 0, tier hard, land (0), then the one extra wild reel: the first of the others.
    const landed = spinWithStreams(config, state, request, { outcome: fixed([...kickerStops, 0, hardTier, 0, 0]), cosmetic: zero } as SpinStreams).result;
    expect(landed.base.attempt?.outcome).toBe('landed');
    expect(landed.base.attempt?.wildReels).toEqual([1, 2]);
    checkAgainstAnalyser(landed);
    // The same grid with reels 2 and 3 wild is a cell of the analyser's sweep for that set.
    const sweep = reelSweep(config, config.reels, [1, 2]);
    const cell = sweepCellOfGrid(config, landed.base.grid, [1, 2]);
    expect(sweep.cells.some((c) => c.kicker === cell.kicker && c.flyers === cell.flyers && c.coins === cell.coins)).toBe(true);

    // A bail on a card one short of full, with four Flyers: DR-012's held mark.
    const flyerStops = stopsWhere((reel, w) => (reel === 1 ? w.includes('kicker') : w.includes('flyer')));
    const almostFull = withScarCardMarks(state, 1, config.scarCard.size - 1);
    const bailed = spinWithStreams(config, almostFull, request, {
      outcome: fixed([...flyerStops, 0, 0, 1, ...new Array(400).fill(0)]),
      cosmetic: zero,
    } as SpinStreams).result;
    expect(bailed.base.attempt?.outcome).toBe('bailed');
    expect(bailed.base.flyers.count).toBe(4);
    expect(bailed.session?.trigger).toEqual({ kind: 'flyers', count: 4 });
    expect(bailed.scarCard).toMatchObject({ before: config.scarCard.size - 1, after: config.scarCard.size - 1, filled: false });
    checkAgainstAnalyser(bailed);

    const plainStops = stopsWhere((reel, w) => !w.includes('kicker') && !w.includes('flyer') && (reel > 2 || w.includes('bolt')));
    const plain = spinWithStreams(config, state, request, { outcome: fixed(plainStops), cosmetic: zero } as SpinStreams).result;
    expect(plain.base.attempt).toBeNull();
    checkAgainstAnalyser(plain);
    expect(plain.base.winCoins).toBe(evaluateWays(config, plain.base.grid, []).reduce((a, w) => a + w.coins, 0));
  });

  it('every spin of a seeded run, Session spins included', () => {
    const masterSeed = formatSeed(seedFromText('engine-vs-analyser-2026-11-25'));
    let state = initialPlayerState(config);
    let sessions = 0;
    for (let i = 0; i < 4000; i++) {
      const out = spin(config, state, { masterSeed, spinIndex: i, betLevel: 1 });
      checkAgainstAnalyser(out.result);
      if (out.result.session !== null) sessions++;
      state = out.state;
    }
    expect(sessions).toBeGreaterThan(10);
  });
});

describe('short seeded simulations within 4·σ/√N (DR-006)', () => {
  it('base game alone: the plain ways win of 400,000 grids', () => {
    const master = seedFromText('short-base-2026-11-25');
    const n = 400_000;
    let total = 0;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const stops = drawStops(spinStreams(master, i).outcome, config.reels);
      const coins = evaluateWays(config, gridFromStops(config.reels, stops, 3), []).reduce((a, w) => a + w.coins, 0);
      total += coins;
      if (coins > 0) hits++;
    }
    const b = report.baseGame.value;
    assertWithinTolerance({ observed: total / n / cost, theoretical: theo(b.rtp), sigma: theo(b.sigma), n }, 'base RTP');
    assertWithinTolerance({ observed: hits / n, theoretical: theo(b.hitFrequency), sigma: bernoulliSigma(theo(b.hitFrequency)), n }, 'base hit rate');
  });

  it('the Session alone: 20,000 forced 3-Flyer Sessions', () => {
    const master = seedFromText('short-session-2026-11-25');
    const n = 20_000;
    const s = report.sessions.value[0]!;
    let total = 0;
    let pain = 0;
    for (let i = 0; i < n; i++) {
      const result = resolveSession(config, { kind: 'flyers', count: 3 }, spinStreams(master, i), Number.MAX_SAFE_INTEGER);
      total += result.totalWinCoins;
      if (result.endReason === 'pain-limit') pain++;
    }
    assertWithinTolerance({ observed: total / n / cost, theoretical: theo(s.meanWin), sigma: theo(s.sdWin), n }, 'Session mean');
    assertWithinTolerance(
      { observed: pain / n, theoretical: theo(s.painLimitProbability), sigma: bernoulliSigma(theo(s.painLimitProbability)), n },
      'pain-limit endings',
    );
  });

  it('the whole game: 300,000 paid spins with the Scar Card carried', () => {
    const job = {
      masterSeed: formatSeed(seedFromText('short-full-2026-11-25')),
      startIndex: 0,
      count: 300_000,
      betLevel: 1,
      laneLength: null,
      initialState: null,
    };
    const summary = summarise(runSimulation(spin, config, job).stats);
    const n = summary.spins;
    assertWithinTolerance({ observed: summary.rtp, theoretical: report.rtp, sigma: report.sigma, n }, 'RTP');
    for (const key of ['hitFrequency', 'winAboveBetFrequency', 'ldwFrequency', 'trickRate', 'sessionRate'] as const) {
      assertWithinTolerance({ observed: summary[key], theoretical: report[key], sigma: bernoulliSigma(report[key]), n }, key);
    }
    // Each part of the split pays between 0 and the whole payout, so its σ is at most √E[X²].
    const bound = theo(Math.sqrt(report.sigma.value ** 2 + report.rtp.value ** 2));
    for (const key of ['baseWays', 'trickLandings', 'sessionFromFlyers', 'sessionFromScarCard'] as const) {
      assertWithinTolerance(
        { observed: summary.rtpSplit.value[key], theoretical: theo(report.rtpSplit.value[key]), sigma: bound, n },
        `split ${key}`,
      );
    }
  });
});
