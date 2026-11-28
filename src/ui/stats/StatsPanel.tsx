import { useEffect, useState } from 'react';
import { FOLK_VALLEY_CONFIG, type GameConfig, type SpinResult } from '../../engine';
import { EMPTY_SESSION, recordSpin, type ObservedSession } from './observed-session';
import { ObservedSection, SimulateSection, TheoreticalSection } from './sections';
import { useSimulation } from './use-simulation';
import { THEORETICAL_REPORT } from './theoretical-report';
import './stats.css';

/**
 * The statistics panel (math-targets section 7): theoretical figures from the analyser, the
 * player's observed figures, and simulations, in three separate, labelled sections
 * (AGENTS.md rule 6). The theoretical figures are the analyser's report, computed ahead of
 * time into `theoretical-report.ts` because `analyse` is too slow for page load. Mounted
 * once in App.tsx; it stays mounted while closed, so the observed
 * session keeps counting and a simulation keeps running.
 *
 * `finishedSpin` is the spin the page has finished showing, or null. The panel counts each
 * spin once, when it has been shown, so its figures never give away a result before the
 * reels do.
 */
export function StatsPanel({ finishedSpin, config = FOLK_VALLEY_CONFIG }: { finishedSpin: SpinResult | null; config?: GameConfig }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<ObservedSession>(EMPTY_SESSION);
  const simulation = useSimulation(config);
  // Precomputed by `npm run analyse:panel`; a test keeps it equal to analyse() of the shipped config.
  const report = THEORETICAL_REPORT.configId === config.id ? THEORETICAL_REPORT : null;

  useEffect(() => {
    if (finishedSpin !== null) setSession((s) => recordSpin(s, finishedSpin));
  }, [finishedSpin]);

  return (
    <section className="stats" aria-labelledby="stats-heading" data-testid="stats-panel">
      <h2 id="stats-heading" className="stats-heading">
        <button
          type="button"
          className="stats-toggle"
          aria-expanded={open}
          aria-controls="stats-body"
          onClick={() => setOpen((o) => !o)}
          data-testid="stats-toggle"
        >
          <span aria-hidden="true" className="stats-chevron">
            {open ? '▾' : '▸'}
          </span>{' '}
          Statistics: the odds, your session and simulations
        </button>
      </h2>
      <div id="stats-body" className="stats-body" hidden={!open}>
        <Explainers />
        <div className="stats-columns">
          <TheoreticalSection report={report} configId={config.id} />
          <ObservedSection session={session} report={report} />
          <SimulateSection config={config} state={simulation.state} report={report} onStart={simulation.start} onCancel={simulation.cancel} />
        </div>
      </div>
    </section>
  );
}

function Explainers() {
  return (
    <section className="stats-explain" aria-labelledby="stats-explain-heading">
      <h3 id="stats-explain-heading">What the figures mean</h3>
      <dl>
        <dt>RTP (return to player)</dt>
        <dd>
          Of every 100 credits bet, how many the game pays back on average over a very long run. At 96% it keeps about 4 of
          every 100 in the long run; any one session can land far above or below that.
        </dd>
        <dt>Volatility (σ)</dt>
        <dd>
          How far single spins swing around that average: the standard deviation of one paid spin’s payout, in multiples of
          the bet. Higher volatility means rarer, bigger wins and longer dry spells.
        </dd>
        <dt>Hit frequency</dt>
        <dd>
          How often a paid spin pays anything at all. It counts payouts smaller than the bet, so it is not a win rate.
        </dd>
        <dt>Loss disguised as a win (LDW)</dt>
        <dd>
          A spin that pays something, but less than it cost: the reels celebrate while the balance goes down. They are
          counted on their own so they are never mistaken for wins.
        </dd>
        <dt>Standard error and z</dt>
        <dd>
          The standard error says how much an observed figure is expected to wobble by chance; z is how many standard errors
          it sits from the theoretical value. Within ±2 happens about 95% of the time.
        </dd>
      </dl>
      <p className="stats-note">Credits are virtual. None of these figures is a promise or a prediction of any one session.</p>
    </section>
  );
}
