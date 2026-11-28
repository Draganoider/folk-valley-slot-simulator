import { beforeAll, describe, expect, it } from 'vitest';
import {
  FOLK_VALLEY_CONFIG,
  WIN_HISTOGRAM_LABELS,
  analyse,
  checkTolerance,
  formatSeed,
  initialPlayerState,
  runSimulation,
  seedFromText,
  spin,
  summarise,
  withTheoretical,
  type PlayerState,
  type SimulationSummary,
  type SpinResult,
  type TheoreticalReport,
} from '../../src/engine';
import {
  bucketLabels,
  compareToTheory,
  formatChance,
  MIN_SPINS_FOR_INTERVAL,
  observedView,
  theoreticalView,
  volatilityClass,
} from '../../src/ui/stats/figures';
import {
  formatCount,
  formatOneIn,
  formatPercent,
  formatScientific,
  formatSignedZ,
  formatTimesBet,
  formatZ,
} from '../../src/ui/stats/format';
import { EMPTY_SESSION, recordSpin } from '../../src/ui/stats/observed-session';
import { SIMULATION_LANE_LENGTH, simulationJob, workerCount } from '../../src/ui/stats/simulation-job';
import { THEORETICAL_REPORT } from '../../src/ui/stats/theoretical-report';
import { panelReportSource } from '../../src/worker/node/panel-report';
import { readFileSync } from 'node:fs';

const CONFIG = FOLK_VALLEY_CONFIG;

let report: TheoreticalReport;
let summary: SimulationSummary;

function seededSpins(text: string, count: number, betLevels: readonly number[] = [1]): SpinResult[] {
  const masterSeed = formatSeed(seedFromText(text));
  let state: PlayerState = initialPlayerState(CONFIG);
  const out: SpinResult[] = [];
  for (let i = 0; i < count; i++) {
    const outcome = spin(CONFIG, state, { masterSeed, spinIndex: i, betLevel: betLevels[i % betLevels.length] as number });
    state = outcome.state;
    out.push(outcome.result);
  }
  return out;
}

/** Every string in a value, however deep. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

beforeAll(() => {
  report = analyse(CONFIG);
  const outcome = runSimulation(spin, CONFIG, simulationJob(CONFIG, 20_000, formatSeed(seedFromText('stats-panel-test'))));
  summary = summarise(outcome.stats);
}, 60_000);

describe('the precomputed theoretical report', () => {
  // analyse() takes about 4 s, shared with every test here through beforeAll, so the full
  // comparison runs in npm test rather than only nightly.
  it('equals analyse() of the shipped configuration exactly; run `npm run analyse:panel` if not', () => {
    expect(THEORETICAL_REPORT.configId).toBe(CONFIG.id);
    expect(THEORETICAL_REPORT.analyserVersion).toBe(report.analyserVersion);
    // Through JSON, as the file was written: float64 survives the round trip exactly.
    expect(JSON.parse(JSON.stringify(THEORETICAL_REPORT))).toEqual(JSON.parse(JSON.stringify(report)));
  });

  it('is byte for byte what the script writes', () => {
    const committed = readFileSync('src/ui/stats/theoretical-report.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(panelReportSource(report));
  });
});

describe('formatting', () => {
  it('writes percentages, multiples of the bet and counts with spoken forms', () => {
    expect(formatPercent(0.9599727750099177, 3)).toEqual({ text: '95.997%', spoken: '95.997 percent' });
    expect(formatTimesBet(5.715258)).toEqual({ text: '5.72× bet', spoken: '5.72 times the bet' });
    expect(formatCount(1_234_567)).toEqual({ text: '1,234,567', spoken: '1,234,567' });
    expect(formatCount(-12)).toEqual({ text: '−12', spoken: 'minus 12' });
    expect(formatCount(-0.001, 1).text).toBe('0.0');
  });

  it('writes chances as 1 in N, with exponents for the very rare', () => {
    expect(formatOneIn(0.10497).text).toBe('1 in 9.5');
    expect(formatOneIn(0.00708836).text).toBe('1 in 141');
    expect(formatOneIn(1.0445612488401445e-16)).toEqual({
      text: '1 in 9.6 × 10¹⁵',
      spoken: '1 in 9.6 times 10 to the power 15',
    });
    expect(formatOneIn(0).text).toBe('never');
    expect(formatScientific(9.96e15).text).toBe('1.0 × 10¹⁶');
  });

  it('never rounds a tiny chance down to zero', () => {
    expect(formatChance(1e-16).text).toBe('< 0.01%');
    expect(formatChance(0.0016).text).toBe('0.16%');
    expect(formatChance(0).text).toBe('0%');
  });

  it('writes z-scores with a sign and in words', () => {
    expect(formatSignedZ(1.234)).toEqual({ text: '+1.23', spoken: 'plus 1.23' });
    expect(formatSignedZ(-0.5)).toEqual({ text: '−0.50', spoken: 'minus 0.50' });
    expect(formatZ(0.81).spoken).toBe('0.8 standard errors above');
    expect(formatZ(-1.26).text).toBe('1.3 SE below');
  });

  it('names the volatility classes of math-targets section 2', () => {
    expect(volatilityClass(2.5).name).toBe('low');
    expect(volatilityClass(5.72).name).toBe('medium');
    expect(volatilityClass(8).name).toBe('medium-high');
    expect(volatilityClass(13).name).toBe('high');
  });

  it('labels every bucket of the statistics histogram', () => {
    const labels = bucketLabels();
    expect(labels).toHaveLength(WIN_HISTOGRAM_LABELS.length);
    expect(labels[0]).toBe('Nothing');
    expect(labels[2]).toBe('1× to under 2×');
    expect(labels.at(-1)).toBe('2,500× bet, the cap');
  });
});

describe('the theoretical view', () => {
  it('shows the analyser’s figures, the RTP to three decimals', () => {
    const view = theoreticalView(report);
    expect(view.kind).toBe('theoretical');
    const byId = Object.fromEntries(view.headline.map((r) => [r.id, r]));
    expect(byId.rtp?.value.text).toBe('95.997%');
    expect(byId.sigma?.value.text).toBe('5.72× bet');
    expect(byId.sigma?.detail?.text).toBe('Medium (3–7× bet)');
    expect(byId.hit?.value.text).toBe('31.2%');
    expect(byId.winAboveBet?.value.text).toBe('17.2%');
    expect(byId.ldw?.value.text).toBe('14.0%');
    const features = Object.fromEntries(view.features.map((r) => [r.id, r.value.text]));
    expect(features.trickRate).toBe('1 in 9.5 paid spins');
    expect(features.sessionRate).toBe('1 in 141 paid spins');
    expect(features.sessionFromCard).toBe('1 in 191 paid spins');
    expect(features.sessionFromFlyers).toBe('1 in 543 paid spins');
  });

  it('includes the Scar Card’s share of the RTP, and the split sums to the RTP', () => {
    const view = theoreticalView(report);
    const card = view.split.find((r) => r.id === 'sessionFromScarCard');
    expect(card?.points.text).toBe('20.2 points');
    expect(view.split.reduce((a, r) => a + r.value, 0)).toBeCloseTo(report.rtp.value, 9);
  });

  it('says the cap is a bound, not a realistic outcome', () => {
    const view = theoreticalView(report);
    expect(view.maxWin.timesBet.text).toBe('2,500× bet');
    expect(view.maxWin.note).toContain('not a realistic outcome');
    expect(view.maxWin.chance.text).toBe('1 in 9.6 × 10¹⁵');
  });

  it('gives the distribution in the histogram’s buckets', () => {
    const view = theoreticalView(report);
    expect(view.distribution).toHaveLength(WIN_HISTOGRAM_LABELS.length);
    expect(view.distribution.reduce((a, b) => a + b.probability, 0)).toBeCloseTo(1, 9);
  });

  it('labels every figure theoretical', () => {
    const view = theoreticalView(report);
    for (const r of [...view.headline, ...view.features]) expect(r.label).toMatch(/^Theoretical /);
  });

  it('refuses anything not labelled theoretical', () => {
    expect(() => theoreticalView(summary as unknown as TheoreticalReport)).toThrow(/analyser report/);
    const relabelled = { ...report, rtp: { kind: 'observed', value: 0.9 } } as unknown as TheoreticalReport;
    expect(() => theoreticalView(relabelled)).toThrow(/not labelled theoretical/);
  });
});

describe('the observed view', () => {
  it('labels every figure observed or simulated', () => {
    for (const voice of ['observed', 'simulated'] as const) {
      const view = observedView(summary, voice, { bet: 100, won: 90 });
      const word = voice === 'observed' ? /observed/i : /simulated/i;
      for (const r of [...view.sample, ...view.headline, ...view.features, ...view.extremes]) expect(r.label).toMatch(word);
      expect(view.kind).toBe(voice);
    }
  });

  it('never takes a theoretical value, even from a summary that carries them', () => {
    const plain = observedView(summary, 'simulated');
    const paired = observedView(withTheoretical(summary, report), 'simulated');
    expect(paired).toEqual(plain);
    const theoreticalText = formatPercent(report.rtp.value, 2).text;
    expect(formatPercent(summary.rtp.value, 2).text).not.toBe(theoreticalText);
    expect(strings(plain)).not.toContain(theoreticalText);
  });

  it('shows the observed RTP with its standard error and 95% interval', () => {
    const view = observedView(summary, 'simulated');
    const rtp = view.headline.find((r) => r.id === 'rtp');
    expect(rtp?.value.text).toBe(formatPercent(summary.rtp.value, 2).text);
    expect(rtp?.detail?.text).toBe(`± ${formatPercent(summary.rtpStandardError as number, 2).text} standard error`);
    const ci = view.headline.find((r) => r.id === 'rtpInterval');
    expect(ci?.detail?.text).toBe('normal approximation');
  });

  it('hides the RTP interval for short sessions, and never shows a negative return', () => {
    const short = { ...summary, spins: MIN_SPINS_FOR_INTERVAL - 1, rtpInterval95: { low: -0.281, high: 5.545 } };
    const hidden = observedView(short as SimulationSummary, 'observed').headline.find((r) => r.id === 'rtpInterval');
    expect(hidden?.value.text).not.toContain('%');
    expect(hidden?.detail?.text).toContain(`${MIN_SPINS_FOR_INTERVAL.toLocaleString('en-US')} spins`);
    const long = { ...summary, spins: MIN_SPINS_FOR_INTERVAL, rtpInterval95: { low: -0.01, high: 1.9 } };
    const floored = observedView(long as SimulationSummary, 'observed').headline.find((r) => r.id === 'rtpInterval');
    expect(floored?.value.text.startsWith(formatPercent(0, 1).text)).toBe(true);
  });

  it('calls the largest win the largest seen, never the max win', () => {
    const view = observedView(summary, 'observed');
    const largest = view.extremes.find((r) => r.id === 'largestWin');
    expect(largest?.label).toBe('Largest observed win');
    expect(largest?.detail?.text).toContain('not the max win');
  });

  it('refuses the analyser report', () => {
    expect(() => observedView(report as unknown as SimulationSummary, 'observed')).toThrow(/observed summary/);
  });
});

describe('simulated against theoretical', () => {
  it('keeps each in its own column, with the z-score of verify.ts', () => {
    const rows = compareToTheory(summary, report);
    const rtp = rows.find((r) => r.id === 'rtp');
    expect(rtp?.observed.text).toBe(formatPercent(summary.rtp.value, 2).text);
    expect(rtp?.theoretical.text).toBe('96.00%');
    const z = checkTolerance({ observed: summary.rtp, theoretical: report.rtp, sigma: report.sigmaLongRun, n: summary.spins }).zScore;
    expect(rtp?.z).toBe(z);
    const hit = rows.find((r) => r.id === 'hit');
    expect(hit?.theoretical.text).toBe('31.2%');
    expect(rows.find((r) => r.id === 'sigma')?.z).toBeNull();
  });

  it('refuses inputs given the wrong way round', () => {
    expect(() => compareToTheory(report as unknown as SimulationSummary, report)).toThrow();
    expect(() => compareToTheory(summary, summary as unknown as TheoreticalReport)).toThrow();
  });
});

describe('the observed session', () => {
  it('counts each finished spin once, in credits at its bet level', () => {
    const [a, b, c] = seededSpins('stats-session', 3, [1, 5, 2]) as [SpinResult, SpinResult, SpinResult];
    let s = recordSpin(EMPTY_SESSION, a);
    s = recordSpin(s, a);
    expect(s.stats.spins).toBe(1);
    s = recordSpin(recordSpin(s, b), c);
    expect(s.stats.spins).toBe(3);
    expect(s.restarted).toBeNull();
    expect(s.creditsBet).toBe(a.costCoins * 1 + b.costCoins * 5 + c.costCoins * 2);
    expect(s.creditsWon).toBe(a.totalWinCoins * 1 + b.totalWinCoins * 5 + c.totalWinCoins * 2);
    expect(s.stats.totalWinCoins).toBe(a.totalWinCoins + b.totalWinCoins + c.totalWinCoins);
  });

  it('starts again on a new seed, or the same seed from spin 1', () => {
    const first = seededSpins('stats-seed-a', 2);
    const other = seededSpins('stats-seed-b', 1);
    let s = recordSpin(recordSpin(EMPTY_SESSION, first[0] as SpinResult), first[1] as SpinResult);
    s = recordSpin(s, other[0] as SpinResult);
    expect(s.stats.spins).toBe(1);
    expect(s.restarted).toBe('new-seed');
    expect(s.stats.masterSeed).toBe(other[0]?.masterSeed);
    s = recordSpin(recordSpin(s, first[0] as SpinResult), first[1] as SpinResult);
    s = recordSpin(s, first[0] as SpinResult);
    expect(s.stats.spins).toBe(1);
  });
});

describe('the simulation job', () => {
  it('uses lanes, so the worker count never changes the result', () => {
    const job = simulationJob(CONFIG, 1_000_000, '0123456789abcdef');
    expect(job.laneLength).toBe(SIMULATION_LANE_LENGTH);
    expect(job.betLevel).toBe(CONFIG.bet.levels[0]);
    expect(job.startIndex).toBe(0);
  });

  it('uses one worker per lane, leaves a core free and stops at four', () => {
    expect(workerCount(10_000, 8)).toBe(1);
    expect(workerCount(1_000_000, 8)).toBe(4);
    expect(workerCount(1_000_000, 3)).toBe(2);
    expect(workerCount(1_000_000, 1)).toBe(1);
  });
});

describe('virtual credits only', () => {
  it('no figure mentions money', () => {
    const texts = [
      ...strings(theoreticalView(report)),
      ...strings(observedView(summary, 'observed', { bet: 2_000, won: 1_500 })),
      ...strings(compareToTheory(summary, report)),
    ];
    for (const t of texts) expect(t).not.toMatch(/[$€£¥]|\b(money|cash|dollars?|euros?|deposit|withdraw)/i);
  });
});
