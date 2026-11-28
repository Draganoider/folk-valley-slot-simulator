import {
  WIN_HISTOGRAM_EDGES,
  bernoulliSigma,
  checkTolerance,
  type SimulationSummary,
  type Theoretical,
  type TheoreticalReport,
} from '../../engine';
import {
  NOT_AVAILABLE,
  formatCount,
  formatCreditsShown,
  formatOneIn,
  formatPercent,
  formatPoints,
  formatSignedZ,
  formatTimesBet,
  formatZ,
  type Shown,
} from './format';

/**
 * The statistics panel's data shaping: from the analyser's `TheoreticalReport` and the
 * statistics' `SimulationSummary` to rows of labelled, formatted figures. Pure, so it is
 * tested in Node (`tests/ui/stats.test.ts`).
 *
 * Theoretical and observed figures are kept apart (AGENTS.md rule 6, math-targets section 7):
 * `theoreticalView` reads only a report labelled theoretical, `observedView` only a summary
 * labelled observed and never its `theoretical` slots, and every label carries the word
 * "theoretical", "observed" or "simulated". The one place the two meet is `compareToTheory`,
 * whose rows keep them in separate, named columns.
 */

export interface FigureRow {
  readonly id: string;
  readonly label: string;
  readonly value: Shown;
  /** A second line under the value, such as a rate as "1 in N", or null. */
  readonly detail: Shown | null;
}

export interface SplitRow {
  readonly id: 'baseWays' | 'trickLandings' | 'sessionFromFlyers' | 'sessionFromScarCard';
  readonly label: string;
  readonly points: Shown;
  /** This part's share of the whole RTP. */
  readonly share: Shown;
  readonly value: number;
}

export interface DistributionBar {
  readonly id: string;
  readonly label: string;
  readonly probability: number;
  readonly percent: Shown;
  readonly oneIn: Shown;
}

export type Voice = 'observed' | 'simulated';

const SPLIT_LABELS: Record<SplitRow['id'], string> = {
  baseWays: 'Base game, no trick landed',
  trickLandings: 'Spins with a landed trick',
  sessionFromFlyers: 'Sessions started by Flyers',
  sessionFromScarCard: 'Sessions started by the Scar Card',
};

const SPLIT_ORDER: readonly SplitRow['id'][] = ['baseWays', 'trickLandings', 'sessionFromFlyers', 'sessionFromScarCard'];

function row(id: string, label: string, value: Shown, detail: Shown | null = null): FigureRow {
  return { id, label, value, detail };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A percentage that does not round a tiny chance down to "0.0%". */
export function formatChance(p: number): Shown {
  if (p === 0) return { text: '0%', spoken: '0 percent' };
  if (p < 0.0001) return { text: '< 0.01%', spoken: 'less than 0.01 percent' };
  if (p < 0.01) return formatPercent(p, 2);
  return formatPercent(p, 1);
}

// ------------------------------------------------------------------ buckets

/** Readable names for the win histogram's buckets (`WIN_HISTOGRAM_EDGES` in stats.ts). */
export function bucketLabels(): string[] {
  const edges = WIN_HISTOGRAM_EDGES as readonly number[];
  const fmt = (x: number): string => x.toLocaleString('en-US');
  const labels = ['Nothing', 'Above 0, under 1× bet'];
  for (let k = 1; k < edges.length; k++) labels.push(`${fmt(edges[k - 1] as number)}× to under ${fmt(edges[k] as number)}×`);
  labels.push(`${fmt(edges[edges.length - 1] as number)}× bet, the cap`);
  return labels;
}

// ---------------------------------------------------------------- volatility

/** The project's volatility classes on σ per paid spin (math-targets section 2). */
export function volatilityClass(sigma: number): { readonly name: string; readonly range: string } {
  if (sigma < 3) return { name: 'low', range: 'under 3× bet' };
  if (sigma <= 7) return { name: 'medium', range: '3–7× bet' };
  if (sigma <= 12) return { name: 'medium-high', range: '7–12× bet' };
  return { name: 'high', range: 'over 12× bet' };
}

// --------------------------------------------------------------- theoretical

export interface TheoreticalView {
  readonly kind: 'theoretical';
  readonly configId: string;
  readonly analyserVersion: string;
  readonly rtp: number;
  readonly headline: readonly FigureRow[];
  readonly features: readonly FigureRow[];
  readonly split: readonly SplitRow[];
  readonly upliftNote: string;
  readonly maxWin: { readonly timesBet: Shown; readonly chance: Shown; readonly note: string };
  readonly distribution: readonly DistributionBar[];
  readonly ranges: readonly { readonly spins: number; readonly spinsShown: Shown; readonly low: Shown; readonly high: Shown }[];
}

function theo<T>(x: Theoretical<T>, what: string): T {
  if (x.kind !== 'theoretical') throw new Error(`${what} is not labelled theoretical.`);
  return x.value;
}

/** Spin counts for the expected-range table. */
export const RANGE_SPINS = [10_000, 100_000, 1_000_000] as const;

/** Every theoretical figure the panel shows. Refuses anything not labelled theoretical. */
export function theoreticalView(report: TheoreticalReport): TheoreticalView {
  if (report.label !== 'theoretical') throw new Error('theoreticalView takes the analyser report only.');
  const rtp = theo(report.rtp, 'rtp');
  const sigma = theo(report.sigma, 'sigma');
  const sigmaLongRun = theo(report.sigmaLongRun, 'sigmaLongRun');
  const hit = theo(report.hitFrequency, 'hitFrequency');
  const ldw = theo(report.ldwFrequency, 'ldwFrequency');
  const vol = volatilityClass(sigma);

  const sessions = theo(report.sessions, 'sessions');
  const sessionRate = theo(report.sessionRate, 'sessionRate');
  const flyerRate = sessions.filter((s) => s.trigger !== 'scarCard').reduce((a, s) => a + s.rate, 0);
  const cardRate = sessions.filter((s) => s.trigger === 'scarCard').reduce((a, s) => a + s.rate, 0);
  const meanSessionWin = sessionRate > 0 ? sessions.reduce((a, s) => a + s.rate * s.meanWin, 0) / sessionRate : 0;
  const trickRate = theo(report.trickRate, 'trickRate');

  const split = theo(report.rtpSplit, 'rtpSplit');
  const uplift = theo(report.rtpSplitByUplift, 'rtpSplitByUplift');
  const maxWin = theo(report.maxWin, 'maxWin');

  const labels = bucketLabels();
  const distribution = theo(report.winDistribution, 'winDistribution');
  if (distribution.length !== labels.length) throw new Error('The distribution does not have the histogram’s buckets.');

  return {
    kind: 'theoretical',
    configId: report.configId,
    analyserVersion: report.analyserVersion,
    rtp,
    headline: [
      row('rtp', 'Theoretical RTP', formatPercent(rtp, 3)),
      row('sigma', 'Theoretical volatility (σ per paid spin)', formatTimesBet(sigma), {
        text: `${capitalise(vol.name)} (${vol.range})`,
        spoken: `${vol.name} volatility, the class for ${vol.range.replace('×', ' times the')}`,
      }),
      row('hit', 'Theoretical hit frequency (any payout)', formatPercent(hit), formatOneIn(hit)),
      row('winAboveBet', 'Theoretical win above bet', formatPercent(theo(report.winAboveBetFrequency, 'winAboveBetFrequency'))),
      row('ldw', 'Theoretical loss disguised as a win', formatPercent(ldw), {
        text: `${formatPercent(hit > 0 ? ldw / hit : 0, 0).text} of all hits`,
        spoken: `${formatPercent(hit > 0 ? ldw / hit : 0, 0).spoken} of all hits`,
      }),
    ],
    features: [
      row('trickRate', 'Theoretical trick attempts', perSpins(trickRate), formatPercent(trickRate)),
      row('trickLand', 'Theoretical trick landing rate', formatPercent(theo(report.trickLandRate, 'trickLandRate'), 0)),
      row('sessionRate', 'Theoretical Sessions', perSpins(sessionRate), formatChance(sessionRate)),
      row('sessionFromCard', 'Theoretical Sessions from the Scar Card', perSpins(cardRate)),
      row('sessionFromFlyers', 'Theoretical Sessions from 3+ Flyers', perSpins(flyerRate)),
      row('sessionMeanWin', 'Theoretical average Session win', formatTimesBet(meanSessionWin, 1)),
    ],
    split: splitRows(split, rtp),
    upliftNote:
      `Counted the way the game was tuned, the plain reels pay ${formatPoints(uplift.baseGame).text}, ` +
      `what landed tricks add on top ${formatPoints(uplift.trickUplift).text}, and Sessions ${formatPoints(uplift.session).text}.`,
    maxWin: {
      timesBet: formatTimesBet(maxWin.timesBet, 0),
      chance: formatOneIn(maxWin.probability),
      note:
        'The cap is a bound on what one paid spin can pay, not a realistic outcome: the analyser ' +
        `puts the chance of reaching it at ${formatOneIn(maxWin.probability).text} paid spins, ` +
        'far more spins than anyone will ever play.',
    },
    distribution: distribution.map((b, i) => ({
      id: `bucket-${i}`,
      label: labels[i] as string,
      probability: b.probability,
      percent: formatChance(b.probability),
      oneIn: formatOneIn(b.probability),
    })),
    ranges: RANGE_SPINS.map((spins) => {
      const half = (1.96 * sigmaLongRun) / Math.sqrt(spins);
      return { spins, spinsShown: formatCount(spins), low: formatPercent(rtp - half, 1), high: formatPercent(rtp + half, 1) };
    }),
  };
}

function perSpins(rate: number): Shown {
  const s = formatOneIn(rate);
  return { text: `${s.text} paid spins`, spoken: `${s.spoken} paid spins` };
}

function splitRows(split: Record<SplitRow['id'], number>, rtp: number): SplitRow[] {
  return SPLIT_ORDER.map((id) => ({
    id,
    label: SPLIT_LABELS[id],
    points: formatPoints(split[id]),
    share: formatPercent(rtp > 0 ? split[id] / rtp : 0, 0),
    value: split[id],
  }));
}

// ------------------------------------------------------------------ observed

export interface ObservedView {
  readonly kind: Voice;
  readonly spins: number;
  readonly rtp: number;
  readonly sample: readonly FigureRow[];
  readonly headline: readonly FigureRow[];
  readonly features: readonly FigureRow[];
  readonly split: readonly SplitRow[];
  readonly extremes: readonly FigureRow[];
  readonly distribution: readonly { readonly id: string; readonly label: string; readonly count: number; readonly share: Shown }[];
}

/**
 * Every observed figure of a summary, labelled with `voice` ("observed" for the player's
 * session, "simulated" for a simulation run). Reads only the summary's observed values: a
 * summary passed through `withTheoretical` gives the same view.
 */
/**
 * Below this many spins the observed RTP's 95% interval is not shown. The normal approximation
 * needs many spins to hold for a payout this skewed: after 25 spins it gave "−28% to 555%",
 * an interval that includes impossible values and tells the player nothing. The low end is
 * also floored at 0%, since a return can't be negative.
 */
export const MIN_SPINS_FOR_INTERVAL = 1000;

export function observedView(
  summary: SimulationSummary,
  voice: Voice,
  credits: { readonly bet: number; readonly won: number } | null = null,
): ObservedView {
  if (summary.label !== 'observed') throw new Error('observedView takes an observed summary only.');
  const V = capitalise(voice);
  const n = summary.spins;
  const c = summary.counts;
  const rtp = summary.rtp.value;
  const sessions = c.sessions.triggers;
  const flyerSessions = sessions.flyers3 + sessions.flyers4 + sessions.flyers5;
  const allSessions = flyerSessions + sessions.scarCard;
  const se = summary.rtpStandardError;
  const ci = summary.rtpInterval95;

  const sample: FigureRow[] = [row('spins', `${V} paid spins`, formatCount(n))];
  if (credits !== null) {
    sample.push(
      row('bet', `${V} credits bet`, formatCreditsShown(credits.bet)),
      row('won', `${V} credits paid out`, formatCreditsShown(credits.won)),
      row('net', `${V} net credits`, signedCredits(credits.won - credits.bet)),
    );
  }

  return {
    kind: voice,
    spins: n,
    rtp,
    sample,
    headline: [
      row(
        'rtp',
        `${V} RTP`,
        formatPercent(rtp, 2),
        se === null
          ? null
          : { text: `± ${formatPercent(se, 2).text} standard error`, spoken: `plus or minus ${formatPercent(se, 2).spoken} standard error` },
      ),
      row(
        'rtpInterval',
        `${V} RTP, 95% interval`,
        ci === null || n < MIN_SPINS_FOR_INTERVAL
          ? NOT_AVAILABLE
          : {
              text: `${formatPercent(Math.max(0, ci.low), 1).text} to ${formatPercent(ci.high, 1).text}`,
              spoken: `${formatPercent(Math.max(0, ci.low), 1).spoken} to ${formatPercent(ci.high, 1).spoken}`,
            },
        ci === null
          ? null
          : n < MIN_SPINS_FOR_INTERVAL
            ? {
                text: `shown from ${MIN_SPINS_FOR_INTERVAL.toLocaleString('en-US')} spins; before that one big win swings it too far to mean anything`,
                spoken: `shown from ${MIN_SPINS_FOR_INTERVAL} spins`,
              }
            : { text: 'normal approximation', spoken: 'normal approximation' },
      ),
      row('sigma', `${V} volatility (σ per paid spin)`, summary.sigma.value === null ? NOT_AVAILABLE : formatTimesBet(summary.sigma.value)),
      row('hit', `${V} hit frequency (any payout)`, formatPercent(summary.hitFrequency.value), countOf(c.hits)),
      row('winAboveBet', `${V} win above bet`, formatPercent(summary.winAboveBetFrequency.value), countOf(c.winsAboveBet)),
      row('ldw', `${V} loss disguised as a win`, formatPercent(summary.ldwFrequency.value), countOf(c.lossesDisguisedAsWins)),
    ],
    features: [
      row('trickRate', `${V} trick attempts`, formatCount(c.tricks.attempts), rateOf(summary.trickRate.value)),
      row(
        'trickLand',
        `${V} tricks landed and bailed`,
        { text: `${formatCount(c.tricks.landed).text} landed, ${formatCount(c.tricks.bailed).text} bailed`, spoken: `${formatCount(c.tricks.landed).spoken} landed, ${formatCount(c.tricks.bailed).spoken} bailed` },
        summary.trickLandRate.value === null ? null : landedShare(summary.trickLandRate.value),
      ),
      row('sessionRate', `${V} Sessions`, formatCount(allSessions), rateOf(summary.sessionRate.value)),
      row('sessionFromCard', `${V} Sessions from the Scar Card`, formatCount(sessions.scarCard)),
      row('sessionFromFlyers', `${V} Sessions from 3+ Flyers`, formatCount(flyerSessions)),
    ],
    split: splitRows(summary.rtpSplit.value, rtp),
    extremes: [
      row('largestWin', `Largest ${voice} win`, formatTimesBet(summary.largestObservedWin.timesBet, 1), {
        text: `on spin ${formatCount(summary.largestObservedWin.spinIndex + 1).text}; the largest seen, not the max win`,
        spoken: `on spin ${formatCount(summary.largestObservedWin.spinIndex + 1).spoken}; the largest seen, not the max win`,
      }),
      row('drought', `Longest ${voice} run without a payout`, { text: `${formatCount(summary.longestDrought).text} spins`, spoken: `${formatCount(summary.longestDrought).spoken} spins` }),
    ],
    distribution: summary.winHistogram.map((b, i) => ({
      id: `bucket-${i}`,
      label: bucketLabels()[i] ?? b.bucket,
      count: b.count,
      share: formatChance(b.count / n),
    })),
  };
}

function signedCredits(net: number): Shown {
  const s = formatCreditsShown(net);
  return net > 0 ? { text: `+${s.text}`, spoken: `plus ${s.spoken}` } : s;
}

function countOf(k: number): Shown {
  const s = formatCount(k);
  const unit = k === 1 ? 'spin' : 'spins';
  return { text: `${s.text} ${unit}`, spoken: `${s.spoken} ${unit}` };
}

function rateOf(rate: number): Shown {
  if (rate === 0) return { text: 'none yet', spoken: 'none yet' };
  const s = formatOneIn(rate);
  return { text: `${s.text} paid spins`, spoken: `${s.spoken} paid spins` };
}

function landedShare(rate: number): Shown {
  const s = formatPercent(rate, 0);
  return { text: `${s.text} landed`, spoken: `${s.spoken} landed` };
}

// ---------------------------------------------------------------- comparison

export interface ComparisonRow {
  readonly id: string;
  readonly label: string;
  readonly observed: Shown;
  readonly theoretical: Shown;
  /** Standard errors between the two, with the theoretical σ (DR-006); null where none applies. */
  readonly z: number | null;
  readonly zShown: Shown;
}

/**
 * Observed figures beside the analyser's, with z-scores: (observed − theoretical) ÷
 * (σ_theoretical / √N), by `checkTolerance` in `verify.ts`. The RTP uses the σ for
 * consecutive spins (`sigmaLongRun`), the rates the σ of one Bernoulli trial.
 */
export function compareToTheory(summary: SimulationSummary, report: TheoreticalReport): ComparisonRow[] {
  if (summary.label !== 'observed') throw new Error('compareToTheory takes an observed summary.');
  if (report.label !== 'theoretical') throw new Error('compareToTheory takes the analyser report.');
  const n = summary.spins;
  const rated = (
    id: string,
    label: string,
    observed: number,
    theoretical: Theoretical<number>,
    sigma: Theoretical<number>,
    format: (x: number) => Shown,
  ): ComparisonRow => {
    const check = checkTolerance({ observed, theoretical, sigma, n });
    return { id, label, observed: format(observed), theoretical: format(theoretical.value), z: check.zScore, zShown: formatSignedZ(check.zScore) };
  };
  const pct1 = (x: number): Shown => formatPercent(x, 1);
  const pct2 = (x: number): Shown => formatPercent(x, 2);
  const chance = (x: number): Shown => formatChance(x);
  const rate = (id: string, label: string, observed: number, theoretical: Theoretical<number>, format: (x: number) => Shown): ComparisonRow =>
    rated(id, label, observed, theoretical, bernoulliSigma(theoretical), format);

  return [
    rated('rtp', 'RTP', summary.rtp.value, report.rtp, report.sigmaLongRun, pct2),
    {
      id: 'sigma',
      label: 'Volatility (σ per paid spin)',
      observed: summary.sigma.value === null ? NOT_AVAILABLE : formatTimesBet(summary.sigma.value),
      theoretical: formatTimesBet(report.sigma.value),
      z: null,
      zShown: NOT_AVAILABLE,
    },
    rate('hit', 'Hit frequency', summary.hitFrequency.value, report.hitFrequency, pct1),
    rate('winAboveBet', 'Win above bet', summary.winAboveBetFrequency.value, report.winAboveBetFrequency, pct1),
    rate('ldw', 'Loss disguised as a win', summary.ldwFrequency.value, report.ldwFrequency, pct1),
    rate('trickRate', 'Trick attempts per spin', summary.trickRate.value, report.trickRate, pct2),
    rate('sessionRate', 'Sessions per spin', summary.sessionRate.value, report.sessionRate, chance),
  ];
}

/** The z-score of an observed RTP against the theoretical one, with the σ for consecutive spins. */
export function rtpZ(summary: SimulationSummary, report: TheoreticalReport): { readonly z: number; readonly shown: Shown } {
  const check = checkTolerance({ observed: summary.rtp, theoretical: report.rtp, sigma: report.sigmaLongRun, n: summary.spins });
  return { z: check.zScore, shown: formatZ(check.zScore) };
}

/**
 * How far an RTP over `spins` paid spins typically lands from the theoretical one: the half
 * width of the 95% band, 1.96 σ / √N, by the normal approximation (rough for short sessions,
 * whose spread is skewed).
 */
export function swingHalfWidth(spins: number, report: TheoreticalReport): number {
  return (1.96 * theo(report.sigmaLongRun, 'sigmaLongRun')) / Math.sqrt(Math.max(1, spins));
}
