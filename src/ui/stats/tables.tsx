import type { ReactNode } from 'react';
import type { ComparisonRow, DistributionBar, FigureRow, SplitRow } from './figures';
import type { Shown } from './format';

/**
 * Table building blocks for the statistics panel. Every figure is in a real table with
 * column and row headers, and every number with a symbol in it ("×", "σ", "−", an
 * exponent) has a spoken form for screen readers.
 */

/** A number as shown, with its spoken form for screen readers when the two differ. */
export function Num({ value }: { value: Shown }) {
  if (value.text === value.spoken) return <>{value.text}</>;
  return (
    <>
      <span aria-hidden="true">{value.text}</span>
      <span className="visually-hidden">{value.spoken}</span>
    </>
  );
}

export function FigureTable({ caption, rows, testId }: { caption: ReactNode; rows: readonly FigureRow[]; testId: string }) {
  return (
    <table className="stats-table" data-testid={testId}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Figure</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-testid={`${testId}-${r.id}`}>
            <th scope="row">{r.label}</th>
            <td>
              <span className="stats-value">
                <Num value={r.value} />
              </span>
              {r.detail !== null && (
                <span className="stats-detail">
                  <Num value={r.detail} />
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SplitTable({ caption, rows, voice, testId }: { caption: ReactNode; rows: readonly SplitRow[]; voice: string; testId: string }) {
  return (
    <table className="stats-table" data-testid={testId}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Source</th>
          <th scope="col">{voice} RTP points</th>
          <th scope="col">Share of the {voice.toLowerCase()} RTP</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-testid={`${testId}-${r.id}`} className={r.id === 'sessionFromScarCard' ? 'stats-highlight' : undefined}>
            <th scope="row">{r.label}</th>
            <td>
              <Num value={r.points} />
            </td>
            <td>
              <Num value={r.share} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Two splits side by side: simulated and theoretical, each in its own column. */
export function SplitCompareTable({ caption, observed, theoretical, testId }: { caption: ReactNode; observed: readonly SplitRow[]; theoretical: readonly SplitRow[]; testId: string }) {
  return (
    <table className="stats-table" data-testid={testId}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Source</th>
          <th scope="col">Simulated RTP points</th>
          <th scope="col">Theoretical RTP points</th>
        </tr>
      </thead>
      <tbody>
        {observed.map((r, i) => (
          <tr key={r.id} className={r.id === 'sessionFromScarCard' ? 'stats-highlight' : undefined}>
            <th scope="row">{r.label}</th>
            <td>
              <Num value={r.points} />
            </td>
            <td>{theoretical[i] === undefined ? '—' : <Num value={theoretical[i].points} />}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ComparisonTable({ caption, rows, testId }: { caption: ReactNode; rows: readonly ComparisonRow[]; testId: string }) {
  return (
    <table className="stats-table" data-testid={testId}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Figure</th>
          <th scope="col">Simulated</th>
          <th scope="col">Theoretical</th>
          <th scope="col">
            <abbr title="standard errors between the simulated and the theoretical value">z</abbr>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-testid={`${testId}-${r.id}`} className={r.z !== null && Math.abs(r.z) > 4 ? 'stats-far' : undefined}>
            <th scope="row">{r.label}</th>
            <td>
              <Num value={r.observed} />
            </td>
            <td>
              <Num value={r.theoretical} />
            </td>
            <td>
              <Num value={r.zShown} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** log₁₀ of the smallest chance the bars draw; rarer buckets get the shortest bar. */
const LOG_FLOOR = -16;

function barWidth(p: number): number {
  if (!(p > 0)) return 0;
  const x = (Math.max(LOG_FLOOR, Math.log10(p)) - LOG_FLOOR) / -LOG_FLOOR;
  return Math.max(0.5, Math.min(100, x * 100));
}

/**
 * The theoretical payout distribution as a bar chart that is also a table: the bars are
 * decoration on a log scale, and the chance in each row is the text the chart stands for.
 */
export function DistributionChart({ bars }: { bars: readonly DistributionBar[] }) {
  return (
    <figure className="stats-chart" aria-labelledby="stats-chart-caption">
      <table className="stats-table" data-testid="theoretical-distribution">
        <caption id="stats-chart-caption">
          Theoretical payout distribution: the chance that one paid spin pays each amount. The bars use a log scale, so
          each step left is ten times rarer; the numbers are exact to the analyser’s rounding.
        </caption>
        <thead>
          <tr>
            <th scope="col">Payout of one paid spin</th>
            <th scope="col">Theoretical chance</th>
            <th scope="col">About</th>
            <td aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.id}>
              <th scope="row">{b.label}</th>
              <td>
                <Num value={b.percent} />
              </td>
              <td>
                <Num value={b.oneIn} />
              </td>
              <td className="stats-bar-cell" aria-hidden="true">
                <svg className="stats-bar" viewBox="0 0 100 10" preserveAspectRatio="none" focusable="false">
                  <rect x="0" y="0" width={barWidth(b.probability)} height="10" rx="1" />
                </svg>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function DistributionCompareTable({
  observed,
  theoretical,
}: {
  observed: readonly { readonly id: string; readonly label: string; readonly count: number; readonly share: Shown }[];
  theoretical: readonly DistributionBar[] | null;
}) {
  return (
    <table className="stats-table" data-testid="simulated-distribution">
      <caption>Simulated payout distribution{theoretical === null ? '' : ', beside the theoretical one'}</caption>
      <thead>
        <tr>
          <th scope="col">Payout of one paid spin</th>
          <th scope="col">Simulated spins</th>
          <th scope="col">Simulated share</th>
          {theoretical !== null && <th scope="col">Theoretical chance</th>}
        </tr>
      </thead>
      <tbody>
        {observed.map((b, i) => (
          <tr key={b.id}>
            <th scope="row">{b.label}</th>
            <td>{b.count.toLocaleString('en-US')}</td>
            <td>
              <Num value={b.share} />
            </td>
            {theoretical !== null && <td>{theoretical[i] === undefined ? '—' : <Num value={theoretical[i].percent} />}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
