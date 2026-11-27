import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FOLK_VALLEY_CONFIG, scarCardMarks, type SpinResult } from '../engine';
import { buildTimeline, type PlayerFrame, type Timeline } from '../presentation';
import { createNullScene, type Scene, type SceneSnapshot } from '../renderer/scene';
import { viewAt } from '../renderer/view';
import {
  describeBaseAttempt,
  describeOutcome,
  describeScarCard,
  describeSessionEnd,
  describeSessionSpin,
  describeSessionStart,
  describeWin,
  formatCredits,
} from './game/describe';
import {
  loadGame,
  newGame,
  playSpin,
  resetCredits,
  saveGame,
  seedFromInput,
  spinCost,
  winCredits,
  withBetLevel,
  withSeed,
  type GameState,
} from './game/game';
import { Playback, speedFor, stepsShown, type FrameScheduler } from './game/playback';
import { loadPreferences, savePreferences, type GoreSetting, type Preferences } from './game/prefs';
import { browserStore } from './game/storage';
import { SceneHost } from './SceneHost';
import { useReducedMotion } from './use-reduced-motion';

const CONFIG = FOLK_VALLEY_CONFIG;
const store = browserStore();

declare global {
  interface Window {
    /** Read-only view of the scene for the browser tests. It cannot start or change a spin. */
    __fv?: { readonly scene: () => SceneSnapshot };
  }
}

/** A fresh seed for a first visit. Which seed is played decides nothing about the odds. */
function randomSeed(): string {
  const words = new Uint32Array(2);
  globalThis.crypto.getRandomValues(words);
  return Array.from(words, (w) => w.toString(16).padStart(8, '0')).join('');
}

/** The real clock and frame loop the timeline plays on; Playwright's `page.clock` stands in for both. */
const realClock = { now: () => performance.now() };
const animationFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(() => callback()),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** The result being shown, and how many of its steps (base spin, then free spins) the scene has resolved. */
interface Showing {
  readonly result: SpinResult;
  readonly framesShown: number;
  readonly done: boolean;
}

const INTERACTIVE = 'input, select, textarea, button, a, [contenteditable="true"]';

export function App() {
  const [game, setGame] = useState<GameState>(() => loadGame(store, CONFIG) ?? newGame(CONFIG, randomSeed()));
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences(store));
  const [shownBalance, setShownBalance] = useState(game.balance);
  const [showing, setShowing] = useState<Showing | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [saved, setSaved] = useState(true);
  const [seedText, setSeedText] = useState(game.masterSeed);
  const reducedMotion = useReducedMotion();

  const gameRef = useRef(game);
  const busyRef = useRef(false);
  const sceneRef = useRef<Scene>(createNullScene());
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const playbackRef = useRef<Playback | null>(null);

  // The whole record is saved on every change, so the balance and the Scar Cards move together.
  useEffect(() => {
    gameRef.current = game;
    setSaved(saveGame(store, game));
  }, [game]);

  useEffect(() => {
    savePreferences(store, prefs);
  }, [prefs]);

  // Turbo is a speed, so it can change mid-spin without changing anything shown.
  useEffect(() => {
    playbackRef.current?.setSpeed(speedFor(prefs.turbo));
  }, [prefs.turbo]);

  // A hidden tab pauses the timeline rather than racing through it unseen.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.hidden) playbackRef.current?.pause();
      else playbackRef.current?.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      playbackRef.current?.stop();
    };
  }, []);

  const currentMarks = scarCardMarks(CONFIG, game.player, game.betLevel);
  const cardSize = CONFIG.scarCard.size;

  // While a spin is shown, the meter holds the card as it was until the scene reaches the end.
  const meterMarks =
    showing !== null && !showing.done && showing.result.betLevel === game.betLevel
      ? showing.result.scarCard.before
      : currentMarks;

  useEffect(() => {
    if (!busyRef.current) sceneRef.current.setScarCard(currentMarks, cardSize);
  }, [currentMarks, cardSize]);

  const onScene = useCallback((scene: Scene | null) => {
    sceneRef.current = scene ?? createNullScene();
    const current = gameRef.current;
    sceneRef.current.setScarCard(scarCardMarks(CONFIG, current.player, current.betLevel), CONFIG.scarCard.size);
  }, []);

  useEffect(() => {
    window.__fv = { scene: () => sceneRef.current.snapshot() };
    return () => {
      delete window.__fv;
    };
  }, []);

  const doSpin = useCallback(async () => {
    if (busyRef.current) return;
    const before = gameRef.current;
    const paid = playSpin(CONFIG, before);
    if (!paid.ok) {
      setNotice('Not enough credits for this bet. Lower the bet or reset credits.');
      return;
    }
    // The engine has decided everything, Session included, before any of it is shown (rule 4).
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    setAnnouncement('Spinning.');
    setGame(paid.game);
    setShownBalance(before.balance - spinCost(CONFIG, before.betLevel));
    setShowing({ result: paid.result, framesShown: 0, done: false });

    // The timeline only orders and times what the result already says (DR-014).
    const timeline: Timeline = buildTimeline(paid.result, {
      gore: prefsRef.current.gore,
      reducedMotion: reducedRef.current,
      turbo: false,
    });
    sceneRef.current.begin();
    let steps = 0;
    await new Promise<void>((resolve) => {
      const onFrame = (frame: PlayerFrame): void => {
        sceneRef.current.render(viewAt(timeline, frame.time));
        const last = frame.entered.at(-1);
        if (last !== undefined) setAnnouncement(last.narration);
        const now = stepsShown(timeline, frame.time);
        if (now !== steps && !frame.done) {
          steps = now;
          setShowing({ result: paid.result, framesShown: now, done: false });
        }
      };
      const onDone = (): void => {
        playbackRef.current = null;
        resolve();
      };
      const playback = new Playback(timeline, realClock, animationFrames, { onFrame, onDone }, { speed: speedFor(prefsRef.current.turbo) });
      playbackRef.current = playback;
      playback.start();
    });
    // The count-up has finished: only now does the balance on screen take the win.
    setShowing({ result: paid.result, framesShown: stepsShown(timeline, timeline.duration), done: true });
    setShownBalance(paid.game.balance);
    setAnnouncement(describeOutcome(paid.result));
    busyRef.current = false;
    setBusy(false);
  }, []);

  const onSkip = useCallback((): void => playbackRef.current?.skip(), []);

  // Space and Enter spin from anywhere that is not itself a control, which keeps its own keys;
  // while a spin plays they skip to its end.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE) !== null) return;
      event.preventDefault();
      if (busyRef.current) onSkip();
      else void doSpin();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doSpin, onSkip]);

  const onReset = (): void => {
    const next = resetCredits(gameRef.current);
    setGame(next);
    setShownBalance(next.balance);
    setNotice('');
  };

  const onBet = (level: number): void => setGame(withBetLevel(CONFIG, gameRef.current, level));

  const onSeed = (event: FormEvent): void => {
    event.preventDefault();
    const seed = seedFromInput(seedText);
    if (seed === null) {
      setNotice('Type a seed: any text, or 16 hexadecimal digits.');
      return;
    }
    setGame(withSeed(gameRef.current, seed));
    setSeedText(seed);
    setShowing(null);
    setNotice(`Seed set. Play starts again from spin 1 of ${seed}.`);
  };

  const onGore = (gore: GoreSetting): void => setPrefs({ ...prefs, gore });
  const onTurbo = (turbo: boolean): void => setPrefs({ ...prefs, turbo });

  const cost = spinCost(CONFIG, game.betLevel);

  return (
    <div className="app">
      <header className="header">
        <h1>Folk Valley</h1>
        <p className="tagline">A free, educational slot simulator. Credits are virtual and have no value outside this page.</p>
        <p className="content-note">Content note: bails show realistic injuries, up to broken bones. Set Gore to Mild to hide the worst.</p>
      </header>

      <main className="layout">
        <section className="stage" aria-label="Reels">
          <SceneHost onScene={onScene} />
          <div className="meter-row">
            <span id="scar-card-label">{describeScarCard(meterMarks, cardSize, game.betLevel)}</span>
            <div
              className="meter"
              role="meter"
              aria-labelledby="scar-card-label"
              aria-valuemin={0}
              aria-valuemax={cardSize}
              aria-valuenow={meterMarks}
              data-testid="scar-card"
              data-marks={meterMarks}
            >
              {Array.from({ length: cardSize }, (_, i) => (
                <span key={i} className={i < meterMarks ? 'mark mark-full' : 'mark'} />
              ))}
            </div>
          </div>
        </section>

        <section className="controls" aria-label="Controls">
          <p className="balance">
            Balance: <strong data-testid="balance" data-credits={shownBalance}>{formatCredits(shownBalance)}</strong>
          </p>
          <label className="field">
            Bet level
            <select value={game.betLevel} disabled={busy} onChange={(e) => onBet(Number(e.target.value))} data-testid="bet">
              {CONFIG.bet.levels.map((level) => (
                <option key={level} value={level}>
                  {level} ({formatCredits(spinCost(CONFIG, level))} a spin)
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="spin" onClick={() => void doSpin()} disabled={busy} data-testid="spin">
            Spin for {formatCredits(cost)}
          </button>
          <button type="button" onClick={onSkip} disabled={!busy} data-testid="skip">
            Skip to the end
          </button>
          <label className="radio">
            <input type="checkbox" checked={prefs.turbo} onChange={(e) => onTurbo(e.target.checked)} data-testid="turbo" />
            Turbo ({speedFor(true)}× speed)
          </label>
          <p className="hint">Press Space or Enter to spin, and again to skip.</p>
          <button type="button" onClick={onReset} disabled={busy} data-testid="reset">
            Reset credits
          </button>

          <form className="field" onSubmit={onSeed}>
            <label htmlFor="seed">Seed</label>
            <div className="seed-row">
              <input id="seed" value={seedText} onChange={(e) => setSeedText(e.target.value)} disabled={busy} autoComplete="off" spellCheck={false} data-testid="seed" />
              <button type="submit" disabled={busy} data-testid="seed-apply">
                Use seed
              </button>
            </div>
            <span className="hint">
              Next: spin <span data-testid="spin-number">{game.spinIndex + 1}</span> of seed <code data-testid="current-seed">{game.masterSeed}</code>
            </span>
          </form>

          <fieldset className="field">
            <legend>Gore</legend>
            {(['full', 'mild'] as const).map((gore) => (
              <label key={gore} className="radio">
                <input type="radio" name="gore" value={gore} checked={prefs.gore === gore} disabled={busy} onChange={() => onGore(gore)} data-testid={`gore-${gore}`} />
                {gore === 'full' ? 'Full' : 'Mild'}
              </label>
            ))}
          </fieldset>

          {notice !== '' && <p className="notice" role="status">{notice}</p>}
          {!saved && <p className="notice">This browser is not saving progress; it will reset when the page closes.</p>}
        </section>

        <section className="results" aria-label="Spin details">
          <h2>Last spin</h2>
          {showing === null ? <p>No spin yet.</p> : <SpinDetails showing={showing} gore={prefs.gore} />}
        </section>
      </main>
      <p className="visually-hidden" aria-live="polite" data-testid="announcement">
        {announcement}
      </p>
    </div>
  );
}

function SpinDetails({ showing, gore }: { showing: Showing; gore: GoreSetting }) {
  const { result, framesShown, done } = showing;
  const { base, session, betLevel } = result;
  if (framesShown === 0) return <p>Playing the spin.</p>;
  const multiplier = base.attempt?.outcome === 'landed' ? base.attempt.winMultiplier : 1;
  return (
    <div data-testid="details">
      <p>
        Spin {result.spinIndex + 1} at bet {betLevel}. Stops: <span data-testid="stops">{base.stops.join(', ')}</span>
      </p>
      {base.attempt !== null && <p data-testid="trick">{describeBaseAttempt(base.attempt, gore)}</p>}
      {base.flyers.count > 0 && <p>Session Flyers: {base.flyers.count}</p>}
      {base.wins.length > 0 ? (
        <ul data-testid="wins">
          {base.wins.map((win) => (
            <li key={win.symbol}>{describeWin(win, betLevel, multiplier)}</li>
          ))}
        </ul>
      ) : (
        <p>No ways win on the reels.</p>
      )}
      {result.scarCard.after !== result.scarCard.before || result.scarCard.filled ? (
        <p>{result.scarCard.filled ? 'The Scar Card filled up.' : `Scar Card: ${result.scarCard.before} → ${result.scarCard.after} marks.`}</p>
      ) : null}
      {session !== null && (
        <div className="session">
          <h3>Session</h3>
          <p>{describeSessionStart(session)}</p>
          <ol data-testid="session-spins">
            {session.spins.slice(0, Math.max(0, framesShown - 1)).map((spin) => (
              <li key={spin.index}>{describeSessionSpin(spin, betLevel, gore)}</li>
            ))}
          </ol>
          {done && <p>{describeSessionEnd(session, betLevel, gore)}</p>}
        </div>
      )}
      {done && (
        <p className="total">
          Total win: <strong data-testid="total-win" data-credits={winCredits(result)}>{formatCredits(winCredits(result))}</strong>
          {result.capped ? ' (maximum win)' : ''}
        </p>
      )}
    </div>
  );
}
