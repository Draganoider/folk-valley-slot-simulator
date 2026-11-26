import type { BailDetail, LadderState, RiderId, SpinResult, WaysWin } from '../engine';
import {
  BEAT_ROLES,
  DEFAULT_TIMELINE_OPTIONS,
  TIMELINE_FORMAT_VERSION,
  type SpinRef,
  type Timeline,
  type TimelineEvent,
  type TimelineOptions,
} from './events';
import { DEFAULT_TIMINGS, type Timings } from './timings';

const RIDER_NAMES: { readonly [R in RiderId]: string } = {
  gramps: 'Gramps',
  kerb: 'Kerb',
  zip: 'Zip',
  dot: 'Dot',
};

/** Distributes `Omit` over the union, so each event keeps its own payload fields. */
type Draft<E> = E extends TimelineEvent ? Omit<E, 'id' | 'start' | 'duration' | 'role' | 'motion'> : never;

/**
 * Turns a spin result into its timeline: a pure function of the result, the options and the
 * timings (DR-007). Same inputs, same timeline; no clock, no `Math.random`.
 *
 * It only orders and times what the result says (AGENTS.md rule 4). The order is:
 *
 * 1. The base spin: spin-up, the five reel stops; the Kicker attempt if any (approach, trick,
 *    then a landing and its wild reels, or a bail, the injury and the patch-up); the ways wins
 *    and the spin's win.
 * 2. The Scar Card, when the base attempt bailed.
 * 3. The Session if one started: the trigger, the intro, each free spin (its reels, its
 *    attempt, the ladder change or the pain, its wins), the ending, the closing card and the total.
 * 4. The count-up of the whole paid spin's win.
 *
 * Gore Mild drops the injury beat at `broken` and marks the bail's patch-up as replacing it;
 * every event then hides blood (DR-009). Neither gore nor reduced motion nor turbo changes
 * which outcomes appear.
 */
export function buildTimeline(
  result: SpinResult,
  options: TimelineOptions = DEFAULT_TIMELINE_OPTIONS,
  timings: Timings = DEFAULT_TIMINGS,
): Timeline {
  const b = new Builder(result, options, timings);
  b.baseSpin();
  b.scarCard();
  b.session();
  b.countUp();
  return {
    formatVersion: TIMELINE_FORMAT_VERSION,
    resultFormatVersion: result.formatVersion,
    configId: result.configId,
    masterSeed: result.masterSeed,
    spinIndex: result.spinIndex,
    betLevel: result.betLevel,
    options: { gore: options.gore, reducedMotion: options.reducedMotion, turbo: options.turbo },
    bloodHidden: options.gore === 'mild',
    reelCount: result.base.stops.length,
    initial: { scarCardMarks: result.scarCard.before },
    duration: b.time,
    events: b.events,
    final: {
      totalWinCoins: result.totalWinCoins,
      totalWinCredits: result.totalWinCoins * result.betLevel,
      capped: result.capped,
      scarCardMarks: result.scarCard.after,
      scarCardSize: result.scarCard.size,
      sessionPlayed: result.session !== null,
    },
  };
}

class Builder {
  readonly events: TimelineEvent[] = [];
  time = 0;
  private readonly bloodHidden: boolean;

  constructor(
    private readonly result: SpinResult,
    private readonly options: TimelineOptions,
    private readonly timings: Timings,
  ) {
    this.bloodHidden = options.gore === 'mild';
  }

  baseSpin(): void {
    const base = this.result.base;
    const spin: SpinRef = { phase: 'base' };
    this.reels(spin, base.stops, base.grid);
    const attempt = base.attempt;
    let multiplier = 1;
    if (attempt !== null) {
      const name = RIDER_NAMES[attempt.rider];
      this.push({ kind: 'trick-approach', spin, skipPoint: false, rider: attempt.rider, kicker: attempt.kicker, narration: `${name} rolls in to the Kicker.` });
      this.push({
        kind: 'trick',
        spin,
        skipPoint: false,
        rider: attempt.rider,
        trickId: attempt.trickId,
        tier: attempt.tier,
        rung: null,
        narration: `${name} tries ${words(attempt.trickId)}, ${attempt.tier}.`,
      });
      if (attempt.outcome === 'landed') {
        multiplier = attempt.winMultiplier;
        this.push({ kind: 'trick-land', spin, skipPoint: false, rider: attempt.rider, trickId: attempt.trickId, narration: `${name} lands it.` });
        const times = attempt.winMultiplier > 1 ? `, wins ×${attempt.winMultiplier}` : '';
        this.push({
          kind: 'wild-reels',
          spin,
          skipPoint: true,
          reels: attempt.wildReels,
          winMultiplier: attempt.winMultiplier,
          narration: `${plural(attempt.wildReels.length, 'reel')} wild${times}.`,
        });
      } else {
        this.bail(spin, attempt.rider, bailOf(attempt.bail));
      }
    }
    this.wins(spin, base.wins, multiplier, base.winCoins, null);
  }

  scarCard(): void {
    const card = this.result.scarCard;
    if (this.result.base.attempt?.outcome !== 'bailed') return;
    const change = card.filled ? 'fill' : card.after === card.before ? 'hold' : 'mark';
    const narration =
      change === 'fill'
        ? `Scar Card full: ${card.size} of ${card.size}.`
        : change === 'hold'
          ? `Scar Card holds at ${card.after} of ${card.size}; the next bail fills it.`
          : `Scar Card: ${card.after} of ${card.size}.`;
    this.push({ kind: 'scar-card', spin: { phase: 'base' }, skipPoint: false, change, size: card.size, before: card.before, after: card.after, narration });
  }

  session(): void {
    const session = this.result.session;
    if (session === null) return;
    const base: SpinRef = { phase: 'base' };
    const name = RIDER_NAMES[session.rider];
    const trigger = session.trigger;
    this.push({
      kind: 'session-trigger',
      spin: base,
      skipPoint: false,
      trigger,
      positions: trigger.kind === 'flyers' ? this.result.base.flyers.positions : [],
      narration: trigger.kind === 'flyers' ? `${trigger.count} Flyers: a Session!` : 'The Scar Card starts a Session!',
    });
    const first = session.spins[0];
    const ladder: LadderState = first !== undefined ? first.ladderBefore : { rung: session.startRung, multiplier: 1, pain: 0 };
    this.push({
      kind: 'session-intro',
      spin: base,
      skipPoint: true,
      rider: session.rider,
      startingSpins: session.startingSpins,
      startRung: session.startRung,
      ladder,
      narration: `${name}'s Session: ${plural(session.startingSpins, 'free spin')} from rung ${session.startRung + 1}, ×${ladder.multiplier}.`,
    });

    for (const s of session.spins) {
      const spin: SpinRef = { phase: 'session', index: s.index };
      this.push({
        kind: 'free-spin',
        spin,
        skipPoint: false,
        index: s.index,
        spinsLeftBefore: s.spinsLeftBefore,
        ladder: s.ladderBefore,
        narration: `Free spin ${s.index + 1}, ${s.spinsLeftBefore} left.`,
      });
      this.reels(spin, s.stops, s.grid);
      const a = s.attempt;
      this.push({ kind: 'trick-approach', spin, skipPoint: false, rider: a.rider, kicker: null, narration: `${name} drops in.` });
      this.push({
        kind: 'trick',
        spin,
        skipPoint: false,
        rider: a.rider,
        trickId: a.trickId,
        tier: null,
        rung: a.rung,
        narration: `${name} tries ${words(a.trickId)} from rung ${a.rung + 1}.`,
      });
      if (a.outcome === 'landed') {
        this.push({ kind: 'trick-land', spin, skipPoint: false, rider: a.rider, trickId: a.trickId, narration: `${name} lands it.` });
        const topHeld = s.ladderAfter.rung === s.ladderBefore.rung;
        this.push({
          kind: 'ladder-climb',
          spin,
          skipPoint: true,
          from: s.ladderBefore,
          to: s.ladderAfter,
          topHeld,
          narration: topHeld
            ? `Top rung held, ×${s.ladderAfter.multiplier}.`
            : `Up to rung ${s.ladderAfter.rung + 1}, ×${s.ladderAfter.multiplier}.`,
        });
      } else {
        this.bail(spin, a.rider, bailOf(a.bail));
        const added = s.spinsAdded > 0 ? `, +${plural(s.spinsAdded, 'spin')}` : '';
        this.push({
          kind: 'pain',
          spin,
          skipPoint: true,
          from: s.ladderBefore,
          to: s.ladderAfter,
          spinsAdded: s.spinsAdded,
          spinsLeftAfter: s.spinsLeftAfter,
          narration: `Pain ${s.ladderAfter.pain}${added}.`,
        });
      }
      this.wins(spin, s.wins, s.ladderAfter.multiplier, s.winCoins, s.runningTotalCoins);
    }

    const reasons = { 'spins-out': 'out of spins', 'pain-limit': 'done for the day', 'max-win': 'the max win is reached' } as const;
    this.push({
      kind: 'session-end',
      spin: base,
      skipPoint: false,
      reason: session.endReason,
      spinsPlayed: session.spins.length,
      narration: `Session over: ${reasons[session.endReason]}.`,
    });
    this.push({
      kind: 'closing-card',
      spin: base,
      skipPoint: false,
      rider: session.rider,
      level: session.closing.level,
      injuryId: session.closing.id,
      friendFilming: true,
      bloodHidden: this.bloodHidden,
      narration: `${name}, patched up: ${words(session.closing.id)}. A friend got it all on video.`,
    });
    this.push({
      kind: 'session-total',
      spin: base,
      skipPoint: true,
      coins: session.totalWinCoins,
      credits: this.credits(session.totalWinCoins),
      narration: `Session total: ${this.credits(session.totalWinCoins)} credits.`,
    });
  }

  countUp(): void {
    const r = this.result;
    const ratio = r.totalWinCoins / r.costCoins;
    let full: number;
    if (r.totalWinCoins === 0) {
      full = this.options.reducedMotion ? this.timings.countUpNoWin.reduced : this.timings.countUpNoWin.full;
    } else {
      const step = this.timings.countUp.find((s) => ratio < s.below) ?? this.timings.countUp[this.timings.countUp.length - 1];
      if (step === undefined) throw new RangeError('The count-up timings have no rows.');
      full = step.ms;
    }
    const credits = this.credits(r.totalWinCoins);
    this.place(
      {
        kind: 'count-up',
        spin: { phase: 'base' },
        skipPoint: true,
        fromCoins: 0,
        toCoins: r.totalWinCoins,
        toCredits: credits,
        capped: r.capped,
        narration: r.totalWinCoins === 0 ? 'No win.' : `Win: ${credits} credits${r.capped ? ', the max win' : ''}.`,
      },
      full,
    );
  }

  private reels(spin: SpinRef, stops: readonly number[], grid: SpinResult['base']['grid']): void {
    this.push({ kind: 'reels-spin-up', spin, skipPoint: false, narration: 'Reels spinning.' });
    stops.forEach((stop, reel) => {
      const symbols = grid[reel] ?? [];
      this.push({
        kind: 'reel-stop',
        spin,
        skipPoint: reel === stops.length - 1,
        reel,
        stop,
        symbols,
        narration: `Reel ${reel + 1}: ${symbols.map(words).join(', ')}.`,
      });
    });
  }

  private bail(spin: SpinRef, rider: RiderId, bail: BailDetail): void {
    const name = RIDER_NAMES[rider];
    this.push({ kind: 'bail-impact', spin, skipPoint: false, rider, animationId: bail.animationId, cutAway: true, narration: `${name} bails.` });
    const { level, id } = bail.injury;
    const hideBroken = this.options.gore === 'mild' && level === 'broken';
    if (!hideBroken) {
      this.push({
        kind: 'injury',
        spin,
        skipPoint: false,
        rider,
        level,
        injuryId: id,
        bloodHidden: this.bloodHidden,
        narration: `${name}: ${words(id)}.`,
      });
    }
    this.push({
      kind: 'patch-up',
      spin,
      skipPoint: true,
      rider,
      replaces: hideBroken ? { level, injuryId: id } : null,
      bloodHidden: this.bloodHidden,
      narration: hideBroken ? `${name} took a bad one and gets patched up, okay.` : `${name} gets up, okay.`,
    });
  }

  private wins(spin: SpinRef, wins: readonly WaysWin[], multiplier: number, winCoins: number, runningTotal: number | null): void {
    const times = multiplier > 1 ? ` ×${multiplier}` : '';
    for (const w of wins) {
      this.push({
        kind: 'win-highlight',
        spin,
        skipPoint: false,
        symbol: w.symbol,
        length: w.length,
        ways: w.ways,
        payPerWay: w.payPerWay,
        coins: w.coins,
        multiplier,
        positions: w.positions,
        narration: `${w.length} ${words(w.symbol)}, ${plural(w.ways, 'way')}: ${this.credits(w.coins)} credits${times}.`,
      });
    }
    if (winCoins > 0) {
      this.push({
        kind: 'spin-win',
        spin,
        skipPoint: true,
        coins: winCoins,
        credits: this.credits(winCoins),
        runningTotalCoins: runningTotal,
        narration: `Spin win: ${this.credits(winCoins)} credits.`,
      });
    }
  }

  private credits(coins: number): number {
    return coins * this.result.betLevel;
  }

  private push(draft: Draft<TimelineEvent>): void {
    if (draft.kind === 'count-up') throw new RangeError('The count-up is placed by countUp().');
    const beat = this.timings.beats[draft.kind];
    this.place(draft, this.options.reducedMotion ? beat.reduced : beat.full);
  }

  private place(draft: Draft<TimelineEvent>, ms: number): void {
    const role = BEAT_ROLES[draft.kind];
    const scaled = this.options.turbo ? ms / this.timings.turboFactor : ms;
    const duration = Math.max(1, Math.round(scaled));
    const motion = this.options.reducedMotion ? 'reduced' : 'full';
    const event = { ...draft, id: this.events.length, start: this.time, duration, role, motion } as TimelineEvent;
    this.events.push(event);
    this.time += duration;
  }
}

function bailOf(bail: BailDetail | null): BailDetail {
  if (bail === null) throw new RangeError('A bailed attempt carries its bail detail (result.ts).');
  return bail;
}

function words(id: string): string {
  return id.replace(/-/g, ' ');
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
