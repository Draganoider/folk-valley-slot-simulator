import type {
  BailDetail,
  BaseTrickAttempt,
  InjuryLevel,
  SessionAttempt,
  SessionResult,
  SessionSpin,
  SpinResult,
  WaysWin,
} from '../../engine';
import type { GoreSetting } from './prefs';

/**
 * Text for everything the result shows, so every win, trick, bail and meter has a label a
 * screen reader can read (rendering research, section 6). Pure: it only reads the result.
 */

/** "grip-tape" → "Grip tape". */
export function humanise(id: string): string {
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "easy manual" → "an easy manual". */
export function withArticle(phrase: string): string {
  return `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

export function formatCredits(credits: number): string {
  return `${credits.toLocaleString('en-US')} credit${credits === 1 ? '' : 's'}`;
}

/** One ways win in credits at the spin's bet level, with the multiplier that applied to it. */
export function describeWin(win: WaysWin, betLevel: number, multiplier = 1): string {
  const credits = win.coins * multiplier * betLevel;
  const times = multiplier === 1 ? '' : ` ×${multiplier}`;
  return `${humanise(win.symbol)} on ${win.length} reels, ${win.ways} way${win.ways === 1 ? '' : 's'}${times}: ${formatCredits(credits)}`;
}

const LEVEL_LABEL: { readonly [L in InjuryLevel]: string } = {
  scuffed: 'scuffed',
  bleeding: 'bleeding a bit',
  broken: 'broken',
  'patched-up': 'patched up',
};

/**
 * An injury as the gore setting shows it (DR-009). Mild swaps `broken` for the patched-up
 * card and hides blood, so the bleeding level loses its detail. The result is not changed.
 */
export function describeInjury(level: InjuryLevel, id: string, gore: GoreSetting): string {
  if (gore === 'mild' && level === 'broken') return 'patched up (gore setting: Mild)';
  if (gore === 'mild' && level === 'bleeding') return 'banged up';
  return `${LEVEL_LABEL[level]}: ${humanise(id).toLowerCase()}`;
}

function describeBail(bail: BailDetail, gore: GoreSetting): string {
  return `bailed, ${describeInjury(bail.injury.level, bail.injury.id, gore)}, rider okay`;
}

export function describeBaseAttempt(attempt: BaseTrickAttempt, gore: GoreSetting): string {
  const who = `${humanise(attempt.rider)} tries ${withArticle(`${attempt.tier} ${humanise(attempt.trickId).toLowerCase()}`)}`;
  if (attempt.outcome === 'bailed' && attempt.bail !== null) return `${who}: ${describeBail(attempt.bail, gore)}`;
  const reels = attempt.wildReels.map((reel) => reel + 1).join(', ');
  const multiplier = attempt.winMultiplier === 1 ? '' : `, wins ×${attempt.winMultiplier}`;
  return `${who}: landed, reel${attempt.wildReels.length === 1 ? '' : 's'} ${reels} wild${multiplier}`;
}

export function describeSessionAttempt(attempt: SessionAttempt, gore: GoreSetting): string {
  const who = `${humanise(attempt.rider)} tries ${withArticle(humanise(attempt.trickId).toLowerCase())}`;
  if (attempt.outcome === 'bailed' && attempt.bail !== null) return `${who}: ${describeBail(attempt.bail, gore)}`;
  return `${who}: landed`;
}

/** One free spin: its attempt, the ladder after it (multiplier, rung, pain) and its win. */
export function describeSessionSpin(spin: SessionSpin, betLevel: number, gore: GoreSetting): string {
  const ladder = spin.ladderAfter;
  const added = spin.spinsAdded > 0 ? `, +${spin.spinsAdded} spin${spin.spinsAdded === 1 ? '' : 's'}` : '';
  return (
    `Free spin ${spin.index + 1}: ${describeSessionAttempt(spin.attempt, gore)}. ` +
    `Multiplier ×${ladder.multiplier}, rung ${ladder.rung}, pain ${ladder.pain} of 3${added}. ` +
    `Win ${formatCredits(spin.winCoins * betLevel)}, ${spin.spinsLeftAfter} left.`
  );
}

export function describeSessionStart(session: SessionResult): string {
  const cause =
    session.trigger.kind === 'flyers' ? `${session.trigger.count} Session Flyers` : 'a full Scar Card';
  return `Session started by ${cause}: ${humanise(session.rider)} rides ${session.startingSpins} free spins from rung ${session.startRung}.`;
}

const END_REASON: { readonly [K in SessionResult['endReason']]: string } = {
  'spins-out': 'out of free spins',
  'pain-limit': 'pain limit reached',
  'max-win': 'maximum win reached',
};

export function describeSessionEnd(session: SessionResult, betLevel: number, gore: GoreSetting): string {
  return (
    `Session over, ${END_REASON[session.endReason]}. ` +
    `${humanise(session.rider)} is ${describeInjury(session.closing.level, session.closing.id, gore)}. ` +
    `Session total ${formatCredits(session.totalWinCoins * betLevel)}.`
  );
}

export function describeScarCard(marks: number, size: number, betLevel: number): string {
  return `Scar Card at bet ${betLevel}: ${marks} of ${size} marks`;
}

/** The one-line summary a screen reader announces when a paid spin has been shown. */
export function describeOutcome(result: SpinResult): string {
  const won = result.totalWinCoins * result.betLevel;
  const paid = result.costCoins * result.betLevel;
  const capped = result.capped ? ' (maximum win)' : '';
  return won > 0 ? `Won ${formatCredits(won)}${capped} for a ${formatCredits(paid)} spin.` : 'No win this spin.';
}
