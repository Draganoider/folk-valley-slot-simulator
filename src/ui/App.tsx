import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FOLK_VALLEY_CONFIG, scarCardMarks, type SpinResult } from '../engine';
import { framesOf } from '../renderer/frame';
import { createNullScene, type Scene, type SceneSnapshot } from '../renderer/scene';
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
import { loadPreferences, savePreferences, type GoreSetting, type Preferences } from './game/prefs';
import { browserStore } from './game/storage';
import { SceneHost } from './SceneHost';
import { StatsPanel } from './stats/StatsPanel';
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

/** The result being shown, and how many of its frames (base grid, then free spins) are on screen. */
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

  // The whole record is saved on every change, so the balance and the Scar Cards move together.
  useEffect(() => {
    gameRef.current = game;
    setSaved(saveGame(store, game));
  }, [game]);

  useEffect(() => {
    savePreferences(store, prefs);
  }, [prefs]);

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

    const frames = framesOf(paid.result);
    for (let i = 0; i < frames.length; i++) {
      await sceneRef.current.show(frames[i]!, { reducedMotion: reducedRef.current });
      setShowing({ result: paid.result, framesShown: i + 1, done: false });
    }
    setShowing({ result: paid.result, framesShown: frames.length, done: true });
    setShownBalance(paid.game.balance);
    setAnnouncement(describeOutcome(paid.result));
    busyRef.current = false;
    setBusy(false);
  }, []);

  // Space and Enter spin from anywhere that is not itself a control, which keeps its own keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE) !== null) return;
      event.preventDefault();
      void doSpin();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doSpin]);

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
          <p className="hint">Press Space or Enter to spin.</p>
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
                <input type="radio" name="gore" value={gore} checked={prefs.gore === gore} onChange={() => onGore(gore)} data-testid={`gore-${gore}`} />
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
      <StatsPanel config={CONFIG} finishedSpin={showing?.done ? showing.result : null} />
      <p className="visually-hidden" aria-live="polite" data-testid="announcement">
        {announcement}
      </p>
    </div>
  );
}

function SpinDetails({ showing, gore }: { showing: Showing; gore: GoreSetting }) {
  const { result, framesShown, done } = showing;
  const { base, session, betLevel } = result;
  if (framesShown === 0) return <p>Reels spinning.</p>;
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
