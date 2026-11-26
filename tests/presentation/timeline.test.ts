import { describe, expect, it } from 'vitest';
import type { SessionSpin, SpinResult } from '../../src/engine';
import {
  BEAT_ROLES,
  DEFAULT_TIMINGS,
  TIMELINE_EVENT_KINDS,
  TIMELINE_FORMAT_VERSION,
  buildTimeline,
  type Timeline,
  type TimelineEvent,
  type TimelineOptions,
} from '../../src/presentation';
import { expectedKinds, sampleResults } from './sample';

const FULL: TimelineOptions = { gore: 'full', reducedMotion: false, turbo: false };
const MILD: TimelineOptions = { ...FULL, gore: 'mild' };
const REDUCED: TimelineOptions = { ...FULL, reducedMotion: true };
const TURBO: TimelineOptions = { ...FULL, turbo: true };

const SAMPLE = sampleResults(20_000);
/** Every sampled result with something beyond a plain spin, plus the first 500 plain ones. */
const INTERESTING = SAMPLE.filter((r, i) => i < 500 || r.base.attempt !== null || r.session !== null);

function of<K extends TimelineEvent['kind']>(t: Timeline, kind: K): Extract<TimelineEvent, { kind: K }>[] {
  return t.events.filter((e): e is Extract<TimelineEvent, { kind: K }> => e.kind === kind);
}

/** The event without its timing and motion style: what it says, not how long or how it moves. */
function content(e: TimelineEvent): Record<string, unknown> {
  const { start, duration, motion, ...rest } = e;
  void start;
  void duration;
  void motion;
  return rest;
}

function structure(t: Timeline): void {
  expect(t.formatVersion).toBe(TIMELINE_FORMAT_VERSION);
  let time = 0;
  t.events.forEach((e, i) => {
    expect(e.id).toBe(i);
    expect(e.start).toBe(time);
    expect(Number.isInteger(e.duration) && e.duration >= 1).toBe(true);
    expect(e.role).toBe(BEAT_ROLES[e.kind]);
    expect(e.narration.length).toBeGreaterThan(0);
    time += e.duration;
  });
  expect(t.duration).toBe(time);
  expect(t.events[t.events.length - 1]?.kind).toBe('count-up');
}

/** Every value an event carries equals the result's, in the result's order (rule 4). */
function agreesWithResult(t: Timeline, r: SpinResult): void {
  const spins: { stops: readonly number[]; grid: SpinResult['base']['grid'] }[] = [r.base, ...(r.session?.spins ?? [])];
  const stops = of(t, 'reel-stop');
  expect(stops.map((e) => [e.reel, e.stop, e.symbols])).toEqual(
    spins.flatMap((s) => s.stops.map((stop, reel) => [reel, stop, s.grid[reel]])),
  );

  const sessionSpins: readonly SessionSpin[] = r.session?.spins ?? [];
  const attempts = [
    ...(r.base.attempt === null ? [] : [{ ...r.base.attempt, rung: null as number | null }]),
    ...sessionSpins.map((s) => ({ ...s.attempt, tier: null, rung: s.attempt.rung as number | null })),
  ];
  expect(of(t, 'trick').map((e) => [e.rider, e.trickId, e.tier, e.rung])).toEqual(
    attempts.map((a) => [a.rider, a.trickId, a.tier, a.rung]),
  );
  expect(of(t, 'trick-land').map((e) => e.trickId)).toEqual(attempts.filter((a) => a.outcome === 'landed').map((a) => a.trickId));
  const bails = attempts.filter((a) => a.outcome === 'bailed').map((a) => ({ rider: a.rider, bail: a.bail! }));
  expect(of(t, 'bail-impact').map((e) => [e.rider, e.animationId])).toEqual(bails.map((b) => [b.rider, b.bail.animationId]));
  expect(of(t, 'patch-up').map((e) => e.rider)).toEqual(bails.map((b) => b.rider));
  if (t.options.gore === 'full') {
    expect(of(t, 'injury').map((e) => [e.rider, e.level, e.injuryId])).toEqual(
      bails.map((b) => [b.rider, b.bail.injury.level, b.bail.injury.id]),
    );
  }

  const wild = of(t, 'wild-reels');
  if (r.base.attempt?.outcome === 'landed') {
    expect(wild.map((e) => [e.reels, e.winMultiplier])).toEqual([[r.base.attempt.wildReels, r.base.attempt.winMultiplier]]);
  } else expect(wild).toEqual([]);

  const baseMultiplier = r.base.attempt?.winMultiplier ?? 1;
  const wins = [
    ...r.base.wins.map((w) => ({ ...w, multiplier: r.base.attempt?.outcome === 'landed' ? baseMultiplier : 1 })),
    ...sessionSpins.flatMap((s) => s.wins.map((w) => ({ ...w, multiplier: s.ladderAfter.multiplier }))),
  ];
  expect(of(t, 'win-highlight').map((e) => [e.symbol, e.length, e.ways, e.payPerWay, e.coins, e.multiplier, e.positions])).toEqual(
    wins.map((w) => [w.symbol, w.length, w.ways, w.payPerWay, w.coins, w.multiplier, w.positions]),
  );
  const paid = [
    ...(r.base.winCoins > 0 ? [[r.base.winCoins, null]] : []),
    ...sessionSpins.filter((s) => s.winCoins > 0).map((s) => [s.winCoins, s.runningTotalCoins]),
  ];
  expect(of(t, 'spin-win').map((e) => [e.coins, e.runningTotalCoins])).toEqual(paid);
  for (const e of of(t, 'spin-win')) expect(e.credits).toBe(e.coins * r.betLevel);

  const card = of(t, 'scar-card');
  if (r.base.attempt?.outcome === 'bailed') {
    expect(card).toHaveLength(1);
    expect([card[0]!.before, card[0]!.after, card[0]!.size]).toEqual([r.scarCard.before, r.scarCard.after, r.scarCard.size]);
    expect(card[0]!.change === 'fill').toBe(r.scarCard.filled);
  } else expect(card).toEqual([]);

  if (r.session !== null) {
    const s = r.session;
    expect(of(t, 'session-trigger').map((e) => e.trigger)).toEqual([s.trigger]);
    const intro = of(t, 'session-intro')[0]!;
    expect([intro.rider, intro.startingSpins, intro.startRung]).toEqual([s.rider, s.startingSpins, s.startRung]);
    expect(of(t, 'free-spin').map((e) => [e.index, e.spinsLeftBefore, e.ladder])).toEqual(
      s.spins.map((x) => [x.index, x.spinsLeftBefore, x.ladderBefore]),
    );
    expect(of(t, 'ladder-climb').map((e) => [e.from, e.to])).toEqual(
      s.spins.filter((x) => x.attempt.outcome === 'landed').map((x) => [x.ladderBefore, x.ladderAfter]),
    );
    expect(of(t, 'pain').map((e) => [e.from, e.to, e.spinsAdded, e.spinsLeftAfter])).toEqual(
      s.spins.filter((x) => x.attempt.outcome === 'bailed').map((x) => [x.ladderBefore, x.ladderAfter, x.spinsAdded, x.spinsLeftAfter]),
    );
    expect(of(t, 'session-end').map((e) => [e.reason, e.spinsPlayed])).toEqual([[s.endReason, s.spins.length]]);
    expect(of(t, 'closing-card').map((e) => [e.rider, e.level, e.injuryId, e.friendFilming])).toEqual([
      [s.rider, s.closing.level, s.closing.id, true],
    ]);
    expect(of(t, 'session-total').map((e) => e.coins)).toEqual([s.totalWinCoins]);
  }

  const count = of(t, 'count-up');
  expect(count.map((e) => [e.fromCoins, e.toCoins, e.toCredits, e.capped])).toEqual([
    [0, r.totalWinCoins, r.totalWinCoins * r.betLevel, r.capped],
  ]);
  expect(t.final).toEqual({
    totalWinCoins: r.totalWinCoins,
    totalWinCredits: r.totalWinCoins * r.betLevel,
    capped: r.capped,
    scarCardMarks: r.scarCard.after,
    scarCardSize: r.scarCard.size,
    sessionPlayed: r.session !== null,
  });
}

function brokenBails(r: SpinResult): number {
  return (r.session?.spins ?? []).filter((s) => s.attempt.bail?.injury.level === 'broken').length;
}

describe('buildTimeline over seeded spins of folk-valley-96-v1', () => {
  it('samples every kind of outcome', () => {
    const has = (p: (r: SpinResult) => boolean) => INTERESTING.some(p);
    expect(has((r) => r.base.attempt?.outcome === 'landed')).toBe(true);
    expect(has((r) => r.base.attempt?.outcome === 'bailed')).toBe(true);
    expect(has((r) => r.scarCard.filled)).toBe(true);
    expect(has((r) => r.session?.trigger.kind === 'flyers')).toBe(true);
    expect(has((r) => r.session?.trigger.kind === 'scar-card')).toBe(true);
    expect(has((r) => brokenBails(r) > 0)).toBe(true);
    expect(has((r) => (r.session?.spins ?? []).some((s) => s.attempt.outcome === 'landed'))).toBe(true);
    expect(has((r) => r.session?.endReason === 'spins-out')).toBe(true);
    expect(has((r) => r.session?.endReason === 'pain-limit')).toBe(true);
    // Every event kind appears somewhere in the sample.
    const kinds = new Set(INTERESTING.flatMap((r) => buildTimeline(r).events.map((e) => e.kind)));
    expect([...kinds].sort()).toEqual([...TIMELINE_EVENT_KINDS].sort());
  });

  it('has every event the result implies exactly once, in order', () => {
    for (const r of INTERESTING) {
      for (const options of [FULL, MILD, REDUCED, TURBO]) {
        const t = buildTimeline(r, options);
        expect(t.events.map((e) => e.kind)).toEqual(expectedKinds(r, options.gore));
        structure(t);
      }
    }
  });

  it('never contradicts the result', () => {
    for (const r of INTERESTING) {
      for (const options of [FULL, MILD, REDUCED, TURBO]) agreesWithResult(buildTimeline(r, options), r);
    }
  });

  it('is a pure function: same timeline every time, plain data, the result untouched', () => {
    for (const r of INTERESTING.slice(0, 400)) {
      const before = structuredClone(r);
      const a = buildTimeline(r);
      expect(buildTimeline(r)).toEqual(a);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      expect(r).toEqual(before);
    }
  });
});

describe('gore setting', () => {
  it('Mild hides the broken beat and all blood, and the patch-up stands in for it', () => {
    let replaced = 0;
    for (const r of INTERESTING) {
      const mild = buildTimeline(r, MILD);
      expect(mild.bloodHidden).toBe(true);
      expect(of(mild, 'injury').some((e) => e.level === 'broken')).toBe(false);
      for (const e of mild.events) if ('bloodHidden' in e) expect(e.bloodHidden).toBe(true);
      const stand = of(mild, 'patch-up').filter((e) => e.replaces !== null);
      expect(stand.map((e) => e.replaces!.level)).toEqual(Array(brokenBails(r)).fill('broken'));
      replaced += stand.length;

      // Everything else is the same as Full.
      const full = buildTimeline(r, FULL);
      expect(full.bloodHidden).toBe(false);
      for (const e of full.events) if ('bloodHidden' in e) expect(e.bloodHidden).toBe(false);
      const strip = (t: Timeline) =>
        t.events
          .filter((e) => !(e.kind === 'injury' && e.level === 'broken'))
          .map((e) => {
            const c = content(e);
            delete c['id'];
            delete c['bloodHidden'];
            delete c['narration'];
            if (c['kind'] === 'patch-up') delete c['replaces'];
            return c;
          });
      expect(strip(mild)).toEqual(strip(full));
    }
    expect(replaced).toBeGreaterThan(0);
  });

  it('Full shows the broken beat with blood allowed', () => {
    const r = INTERESTING.find((x) => brokenBails(x) > 0)!;
    const broken = of(buildTimeline(r, FULL), 'injury').filter((e) => e.level === 'broken');
    expect(broken).toHaveLength(brokenBails(r));
    expect(broken.every((e) => !e.bloodHidden)).toBe(true);
  });
});

describe('reduced motion', () => {
  it('keeps every information beat, at its full length, and shortens only motion beats', () => {
    for (const r of INTERESTING) {
      const full = buildTimeline(r, FULL);
      const reduced = buildTimeline(r, REDUCED);
      expect(reduced.events.map(content)).toEqual(full.events.map(content));
      full.events.forEach((f, i) => {
        const e = reduced.events[i]!;
        expect(e.motion).toBe('reduced');
        expect(f.motion).toBe('full');
        if (e.role === 'information') expect(e.duration).toBe(f.duration);
        else expect(e.duration).toBeLessThan(f.duration);
      });
    }
  });
});

describe('turbo', () => {
  it('divides every duration by the turbo factor', () => {
    for (const r of INTERESTING.slice(0, 2000)) {
      const full = buildTimeline(r, FULL);
      const turbo = buildTimeline(r, TURBO);
      expect(turbo.events.map(content)).toEqual(full.events.map(content));
      full.events.forEach((f, i) => {
        expect(turbo.events[i]!.duration).toBe(Math.max(1, Math.round(f.duration / DEFAULT_TIMINGS.turboFactor)));
      });
      expect(turbo.duration).toBeLessThan(full.duration);
    }
  });

  it('combines with reduced motion', () => {
    const r = INTERESTING.find((x) => x.session !== null)!;
    const both = buildTimeline(r, { ...REDUCED, turbo: true });
    const reduced = buildTimeline(r, REDUCED);
    both.events.forEach((e, i) => {
      expect(e.duration).toBe(Math.max(1, Math.round(reduced.events[i]!.duration / DEFAULT_TIMINGS.turboFactor)));
    });
  });
});

describe('edge cases from hand-edited results', () => {
  const bailed = INTERESTING.find((r) => r.base.attempt?.outcome === 'bailed' && !r.scarCard.filled && r.session === null)!;
  const withSession = INTERESTING.find((r) => r.session !== null && r.session.spins.length > 0)!;

  it('shows a held Scar Card mark (DR-012)', () => {
    const held: SpinResult = { ...bailed, scarCard: { ...bailed.scarCard, before: 4, after: 4, filled: false } };
    const card = of(buildTimeline(held), 'scar-card');
    expect(card.map((e) => [e.change, e.before, e.after])).toEqual([['hold', 4, 4]]);
  });

  it('marks and fills', () => {
    expect(of(buildTimeline(bailed), 'scar-card')[0]!.change).toBe('mark');
    const fill = INTERESTING.find((r) => r.scarCard.filled)!;
    expect(of(buildTimeline(fill), 'scar-card')[0]!.change).toBe('fill');
  });

  it('plays a Session with no free spins (started with nothing left under the cap)', () => {
    const s = withSession.session!;
    const empty: SpinResult = { ...withSession, session: { ...s, spins: [], endReason: 'max-win', totalWinCoins: 0 } };
    const t = buildTimeline(empty);
    expect(t.events.map((e) => e.kind)).toEqual(expectedKinds(empty));
    expect(of(t, 'session-intro')[0]!.ladder).toEqual({ rung: s.startRung, multiplier: 1, pain: 0 });
  });

  it('carries the cap into the count-up', () => {
    const capped: SpinResult = { ...withSession, capped: true };
    const count = of(buildTimeline(capped), 'count-up')[0]!;
    expect(count.capped).toBe(true);
    expect(count.duration).toBeGreaterThan(0);
  });

  it('gives a zero win a short count-up', () => {
    const none = INTERESTING.find((r) => r.totalWinCoins === 0)!;
    const count = of(buildTimeline(none), 'count-up')[0]!;
    expect([count.toCoins, count.duration]).toEqual([0, DEFAULT_TIMINGS.countUpNoWin.full]);
  });

  it('refuses a bailed attempt without its bail detail', () => {
    const broken: SpinResult = { ...bailed, base: { ...bailed.base, attempt: { ...bailed.base.attempt!, bail: null } } };
    expect(() => buildTimeline(broken)).toThrow(RangeError);
  });
});
