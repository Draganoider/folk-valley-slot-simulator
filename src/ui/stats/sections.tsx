import { useMemo, useState } from 'react';
import { RNG_VERSION, STATS_FORMAT_VERSION, summarise, type GameConfig, type TheoreticalReport } from '../../engine';
import { compareToTheory, observedView, rtpZ, swingHalfWidth, theoreticalView, type TheoreticalView } from './figures';
import { formatCount } from './format';
import type { ObservedSession } from './observed-session';
import {
  ComparisonTable,
  DistributionChart,
  DistributionCompareTable,
  FigureTable,
  Num,
  SplitCompareTable,
  SplitTable,
} from './tables';
import { SIMULATION_LANE_LENGTH, SIMULATION_SIZES } from './simulation-job';
import type { SimulationState } from './use-simulation';

// ----------------------------------------------------------------- theoretical

export function TheoreticalSection({ report, configId }: { report: TheoreticalReport | null; configId: string }) {
  const view = useMemo(() => (report === null ? null : theoreticalView(report)), [report]);
  return (
    <section className="stats-section stats-theoretical" aria-labelledby="stats-theoretical-heading" data-testid="stats-theoretical">
      <h3 id="stats-theoretical-heading">Theoretical: this game’s math</h3>
      <p className="stats-lede">
        Worked out exactly from the reel strips, the trick and Session odds and the paytable, by the game’s analyser. The
        same for every player; nothing here comes from spins.
      </p>
      {view === null ? (
        <p data-testid="theoretical-status">
          No theoretical figures were computed for configuration <code>{configId}</code>, so none are shown.
        </p>
      ) : (
        <TheoreticalFigures view={view} />
      )}
    </section>
  );
}

function TheoreticalFigures({ view }: { view: TheoreticalView }) {
  return (
    <>
      <FigureTable caption="Theoretical return and volatility" rows={view.headline} testId="theoretical" />
      <SplitTable
        caption="Where the theoretical RTP comes from, including the Scar Card’s share"
        rows={view.split}
        voice="Theoretical"
        testId="theoretical-split"
      />
      <p className="stats-note">{view.upliftNote}</p>
      <FigureTable caption="Theoretical tricks and Sessions" rows={view.features} testId="theoretical-features" />

      <h4>Theoretical max win</h4>
      <p data-testid="theoretical-max-win">
        One paid spin pays at most{' '}
        <strong>
          <Num value={view.maxWin.timesBet} />
        </strong>
        . {view.maxWin.note}
      </p>

      <h4>Theoretical payout distribution</h4>
      <DistributionChart bars={view.distribution} />

      <h4>Theoretical range after many spins</h4>
      <table className="stats-table" data-testid="theoretical-ranges">
        <caption>
          Where the RTP of a run of paid spins lands 95% of the time (normal approximation, with σ for consecutive spins)
        </caption>
        <thead>
          <tr>
            <th scope="col">Paid spins</th>
            <th scope="col">Theoretical 95% range of the RTP</th>
          </tr>
        </thead>
        <tbody>
          {view.ranges.map((r) => (
            <tr key={r.spins}>
              <th scope="row">
                <Num value={r.spinsShown} />
              </th>
              <td>
                <Num value={r.low} /> to <Num value={r.high} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="stats-note">
        Configuration <code>{view.configId}</code>, analyser <code>{view.analyserVersion}</code>.
      </p>
    </>
  );
}

// -------------------------------------------------------------------- observed

/** Below this many spins the normal approximation's band is too wide to say anything useful. */
const SWING_MIN_SPINS = 100;

export function ObservedSection({ session, report }: { session: ObservedSession; report: TheoreticalReport | null }) {
  const stats = session.stats;
  const summary = useMemo(() => (stats.spins === 0 ? null : summarise(stats)), [stats]);
  const view = useMemo(
    () => (summary === null ? null : observedView(summary, 'observed', { bet: session.creditsBet, won: session.creditsWon })),
    [summary, session.creditsBet, session.creditsWon],
  );
  const z = useMemo(() => (report === null || summary === null ? null : rtpZ(summary, report)), [report, summary]);
  return (
    <section className="stats-section stats-observed" aria-labelledby="stats-observed-heading" data-testid="stats-observed">
      <h3 id="stats-observed-heading">Your session: observed</h3>
      <p className="stats-lede">Counted from your own spins since this page opened. Changing the bet keeps counting; a new seed starts again.</p>
      {session.restarted === 'new-seed' && <p className="stats-note">A new seed started a new observed session.</p>}
      {view === null ? (
        <p data-testid="observed-empty">No spins yet. Play a few and your figures appear here.</p>
      ) : (
        <>
          <p className="stats-swing" data-testid="observed-swing">
            {stats.spins < 1_000 ? `Only ${formatCount(stats.spins).text} spin${stats.spins === 1 ? '' : 's'}: ` : `${formatCount(stats.spins).text} spins: `}
            one Session or one big win moves a short session’s RTP by many points, so it can land far above or below the
            theoretical figure. That is normal and says nothing about the next spin.
            {report !== null &&
              stats.spins >= SWING_MIN_SPINS &&
              ` After this many spins the RTP lands within about ±${formatCount(swingHalfWidth(stats.spins, report) * 100).text} points of the theoretical figure 95% of the time (normal approximation, rough for short sessions).`}
          </p>
          <FigureTable caption="Your session so far" rows={view.sample} testId="observed-sample" />
          <FigureTable caption="Observed return and volatility" rows={view.headline} testId="observed" />
          {z !== null && (
            <p data-testid="observed-z">
              Your observed RTP is <Num value={z.shown} /> the theoretical RTP.
            </p>
          )}
          <FigureTable caption="Observed tricks and Sessions" rows={view.features} testId="observed-features" />
          <SplitTable caption="Where your observed RTP came from" rows={view.split} voice="Observed" testId="observed-split" />
          <FigureTable caption="Observed extremes" rows={view.extremes} testId="observed-extremes" />
        </>
      )}
    </section>
  );
}

// -------------------------------------------------------------------- simulate

export function SimulateSection({
  config,
  state,
  report,
  onStart,
  onCancel,
}: {
  config: GameConfig;
  state: SimulationState;
  report: TheoreticalReport | null;
  onStart: (count: number) => void;
  onCancel: () => void;
}) {
  const [size, setSize] = useState<number>(SIMULATION_SIZES[1]);
  const running = state.status === 'running';
  const theoView = useMemo(() => (report === null ? null : theoreticalView(report)), [report]);
  const finished = state.status === 'finished' ? state : null;
  const summary = finished?.summary ?? null;
  const simView = useMemo(() => (summary === null ? null : observedView(summary, 'simulated')), [summary]);
  const comparison = useMemo(() => (summary === null || report === null ? null : compareToTheory(summary, report)), [summary, report]);

  return (
    <section className="stats-section stats-simulate" aria-labelledby="stats-simulate-heading" data-testid="stats-simulate">
      <h3 id="stats-simulate-heading">Simulate: simulated spins</h3>
      <p className="stats-lede">
        Plays many paid spins in the background with the same engine, off the main page, then sets the simulated figures
        beside the theoretical ones. Nothing here touches your balance or your session.
      </p>
      <form
        className="stats-sim-controls"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(size);
        }}
      >
        <fieldset disabled={running}>
          <legend>Spins to simulate</legend>
          {SIMULATION_SIZES.map((n) => (
            <label key={n} className="radio">
              <input type="radio" name="stats-sim-size" value={n} checked={size === n} onChange={() => setSize(n)} data-testid={`sim-size-${n}`} />
              {n.toLocaleString('en-US')}
            </label>
          ))}
        </fieldset>
        <div className="stats-sim-buttons">
          <button type="submit" disabled={running} data-testid="sim-start">
            Simulate {size.toLocaleString('en-US')} spins
          </button>
          <button type="button" onClick={onCancel} disabled={!running || state.cancelling} data-testid="sim-cancel">
            Cancel
          </button>
        </div>
      </form>

      {running && (
        <div className="stats-progress">
          <progress
            max={state.job.count}
            value={state.completed}
            aria-label="Simulation progress"
            aria-valuetext={`${formatCount(state.completed).text} of ${formatCount(state.job.count).text} spins simulated`}
            data-testid="sim-progress"
          />
          <span>
            {formatCount(state.completed).text} of {formatCount(state.job.count).text} spins simulated
            {state.cancelling ? ', cancelling…' : ''}
          </span>
        </div>
      )}

      <p role="status" className="stats-sim-status" data-testid="sim-status">
        {state.status === 'running' && state.completed === 0 ? 'Simulation started.' : ''}
        {finished !== null &&
          (finished.cancelled
            ? `Simulation cancelled after ${formatCount(finished.summary?.spins ?? 0).text} of ${formatCount(finished.job.count).text} spins.`
            : `Simulation finished: ${formatCount(finished.job.count).text} spins.`)}
        {state.status === 'error' && `The simulation failed: ${state.message}`}
      </p>

      {finished !== null && simView !== null && summary !== null && (
        <div data-testid="sim-results">
          <h4>Simulated results{finished.cancelled ? ' (cancelled, partial)' : ''}</h4>
          <p className="stats-note" data-testid="sim-meta">
            Seed <code>{finished.job.masterSeed}</code>, {formatCount(summary.spins).text} simulated paid spins, configuration{' '}
            <code>{config.id}</code>, generator <code>{RNG_VERSION}</code>, statistics format {STATS_FORMAT_VERSION}. The Scar Card
            starts empty every {formatCount(SIMULATION_LANE_LENGTH).text} spins. {finished.workers} worker{finished.workers === 1 ? '' : 's'},{' '}
            {(finished.milliseconds / 1000).toFixed(1)} s.
            {!finished.cancelled && (
              <>
                {' '}
                The same run from the command line: <code>npm run simulate -- --spins {finished.job.count} --seed {finished.job.masterSeed} --lane {SIMULATION_LANE_LENGTH}</code>
              </>
            )}
          </p>
          {comparison !== null ? (
            <>
              <ComparisonTable
                caption="Simulated against theoretical. z is how many standard errors apart they are; within ±2 happens about 95% of the time by chance."
                rows={comparison}
                testId="sim-compare"
              />
              {theoView !== null && (
                <SplitCompareTable caption="Where the simulated RTP came from, beside the theoretical split" observed={simView.split} theoretical={theoView.split} testId="sim-split" />
              )}
            </>
          ) : (
            <>
              <p className="stats-note">No theoretical figures for this configuration, so there is nothing to compare with.</p>
              <FigureTable caption="Simulated return and volatility" rows={simView.headline} testId="sim-figures" />
            </>
          )}
          <FigureTable caption="Simulated tricks and Sessions" rows={simView.features} testId="sim-features" />
          <FigureTable caption="Simulated extremes" rows={simView.extremes} testId="sim-extremes" />
          <DistributionCompareTable observed={simView.distribution} theoretical={theoView?.distribution ?? null} />
        </div>
      )}
    </section>
  );
}
