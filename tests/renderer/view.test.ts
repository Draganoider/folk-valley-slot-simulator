import { describe, expect, it } from 'vitest';
import { FOLK_VALLEY_CONFIG, formatSeed, initialPlayerState, seedFromText, spin, type SpinResult } from '../../src/engine';
import { buildTimeline, sceneAt, type Timeline, type TimelineEvent, type TimelineEventKind, type TimelineOptions } from '../../src/presentation';
import { BAIL_CUT_AT, viewAt } from '../../src/renderer/view';

const CONFIG = FOLK_VALLEY_CONFIG;
const BET = CONFIG.bet.levels[0]!;
const FULL: TimelineOptions = { gore: 'full', reducedMotion: false, turbo: false };

/**
 * Seeds found with the engine (`.scratch/timeline-scene/find-seeds.ts`); the e2e tests use
 * the same ones. Each is the text seed of a first paid spin at the lowest bet.
 */
const SEEDS = {
  landed: 'fv-land-45', // base landing with a ways win, no Session
  bailed: 'fv-bail-5', // base bail, scuffed, marks the Scar Card
  session: 'fv-session-532', // a Session with landings and bails
  broken: 'fv-broken-14', // a Session whose third pain shows `broken`
} as const;

function firstSpin(text: string): SpinResult {
  return spin(CONFIG, initialPlayerState(CONFIG), { masterSeed: formatSeed(seedFromText(text)), spinIndex: 0, betLevel: BET }).result;
}

function timelineOf(text: string, options: TimelineOptions = FULL): Timeline {
  return buildTimeline(firstSpin(text), options);
}

function event<K extends TimelineEventKind>(timeline: Timeline, kind: K, nth = 0): Extract<TimelineEvent, { kind: K }> {
  const found = timeline.events.filter((e) => e.kind === kind)[nth];
  if (found === undefined) throw new Error(`no ${kind} #${nth}`);
  return found as Extract<TimelineEvent, { kind: K }>;
}

const at = (e: TimelineEvent, fraction: number): number => e.start + Math.floor(e.duration * fraction);

describe('the seeds', () => {
  it('still give the spins the tests rely on', () => {
    const landed = firstSpin(SEEDS.landed);
    expect(landed.base.attempt?.outcome).toBe('landed');
    expect(landed.session).toBeNull();
    expect(landed.base.wins.length).toBeGreaterThan(0);
    const bailed = firstSpin(SEEDS.bailed);
    expect(bailed.base.attempt?.outcome).toBe('bailed');
    expect(bailed.session).toBeNull();
    expect(firstSpin(SEEDS.session).session?.spins.length).toBeGreaterThan(2);
    expect(firstSpin(SEEDS.broken).session?.spins.some((s) => s.attempt.bail?.injury.level === 'broken')).toBe(true);
  });
});

describe('viewAt', () => {
  it('is a pure function of the time, so a seek lands on the same view as playing to it', () => {
    const timeline = timelineOf(SEEDS.session);
    const before = structuredClone(timeline);
    for (const t of [0, 123, 2_000, timeline.duration / 2, timeline.duration - 1, timeline.duration]) {
      expect(viewAt(timeline, t)).toEqual(viewAt(timeline, t));
      expect(JSON.parse(JSON.stringify(viewAt(timeline, t)))).toEqual(viewAt(timeline, t));
    }
    expect(timeline).toEqual(before);
  });

  it('spins every reel at the start and stops them one by one, left to right', () => {
    const timeline = timelineOf(SEEDS.landed);
    const result = firstSpin(SEEDS.landed);
    const start = viewAt(timeline, 10);
    expect(start.activeKind).toBe('reels-spin-up');
    expect(start.reels.every((r) => r.symbols === null)).toBe(true);
    expect(new Set(start.reels.map((r) => r.spinOffset)).size).toBeGreaterThan(1);

    for (let reel = 0; reel < 5; reel++) {
      const stop = timeline.events.filter((e) => e.kind === 'reel-stop')[reel]!;
      const view = viewAt(timeline, at(stop, 0.1));
      expect(view.reels.filter((r) => r.symbols !== null)).toHaveLength(reel + 1);
      expect(view.reels[reel]!.symbols).toEqual(result.base.grid[reel]);
      expect(view.reels[reel]!.stop).toBe(result.base.stops[reel]);
      expect(view.reels[reel]!.settle).toBeGreaterThan(0);
    }
  });

  it('shows a landed trick: the approach, the jump, the landing, then the Kicker reel turning wild', () => {
    const timeline = timelineOf(SEEDS.landed);
    const attempt = firstSpin(SEEDS.landed).base.attempt!;

    const approach = viewAt(timeline, at(event(timeline, 'trick-approach'), 0.5));
    expect(approach.rider?.pose).toBe('approach');
    expect(approach.rider?.rider).toBe(attempt.rider);
    expect(approach.kicker).toEqual(attempt.kicker);

    const air = viewAt(timeline, at(event(timeline, 'trick'), 0.5));
    expect(air.rider?.pose).toBe('air');
    expect(air.rider?.lift).toBeCloseTo(1, 1);
    expect(air.rider?.clip).toEqual({ kind: 'trick', id: attempt.trickId, progress: expect.any(Number) });

    expect(viewAt(timeline, at(event(timeline, 'trick-land'), 0.5)).rider?.label).toBe('LANDED!');

    const wild = event(timeline, 'wild-reels');
    expect(viewAt(timeline, at(wild, 0.01)).wildReels).toEqual([attempt.wildReels[0]]);
    expect(viewAt(timeline, at(wild, 0.01)).wildReels[0]).toBe(attempt.kicker.reel);
    expect(viewAt(timeline, wild.start + wild.duration).wildReels).toEqual(attempt.wildReels);
    expect(viewAt(timeline, wild.start + wild.duration).rider).toBeNull();
  });

  it('outlines each ways win with its amount, then every win of the spin', () => {
    const timeline = timelineOf(SEEDS.landed);
    const result = firstSpin(SEEDS.landed);
    const first = event(timeline, 'win-highlight');
    const view = viewAt(timeline, at(first, 0.5));
    expect(view.highlights).toEqual(first.positions);
    expect(view.winLabel).toContain(String(first.coins * BET));
    if (first.multiplier > 1) expect(view.winLabel).toContain(`×${first.multiplier}`);

    const end = viewAt(timeline, timeline.duration);
    const all = new Set(result.base.wins.flatMap((w) => w.positions.map((p) => `${p.reel},${p.row}`)));
    expect(new Set(end.highlights.map((p) => `${p.reel},${p.row}`))).toEqual(all);
    expect(end.winLabel).toBeNull();
  });

  it('cuts away from a bail on contact with a flash, then shows the injury and the patch-up', () => {
    const timeline = timelineOf(SEEDS.bailed);
    const bail = firstSpin(SEEDS.bailed).base.attempt!;
    const impact = event(timeline, 'bail-impact');

    const falling = viewAt(timeline, at(impact, BAIL_CUT_AT / 2));
    expect(falling.rider?.pose).toBe('falling');
    expect(falling.flash).toBe(0);
    const cut = viewAt(timeline, at(impact, BAIL_CUT_AT + 0.02));
    expect(cut.rider).toBeNull();
    expect(cut.flash).toBeGreaterThan(0.9);

    const injury = viewAt(timeline, at(event(timeline, 'injury'), 0.5)).card!;
    expect(injury.kind).toBe('injury');
    expect(injury.level).toBe('scuffed');
    expect(injury.title).toBe('SCUFFED');
    expect(injury.heldFrame).toEqual({ rider: bail.rider, level: 'scuffed', injuryId: bail.bail?.injury.id, bloodHidden: false });

    const patched = viewAt(timeline, at(event(timeline, 'patch-up'), 0.5)).card!;
    expect(patched.title).toBe('PATCHED UP');
    expect(patched.level).toBe('patched-up');
  });

  it('marks the Scar Card on a base bail', () => {
    const timeline = timelineOf(SEEDS.bailed);
    const mark = event(timeline, 'scar-card');
    const view = viewAt(timeline, at(mark, 0.5));
    expect(view.card?.title).toBe('SCAR CARD +1');
    expect(view.scarCard).toEqual({ marks: mark.after, size: mark.size, change: 'mark' });
    expect(viewAt(timeline, mark.start - 1).scarCard.marks).toBe(mark.before);
  });

  it('never flashes or moves the camera under reduced motion, and keeps every card', () => {
    const timeline = timelineOf(SEEDS.bailed, { ...FULL, reducedMotion: true });
    const impact = event(timeline, 'bail-impact');
    for (let t = impact.start; t < impact.start + impact.duration; t++) {
      const view = viewAt(timeline, t);
      expect(view.flash).toBe(0);
      expect(view.reduced).toBe(true);
    }
    const spinning = viewAt(timeline, 5);
    expect(spinning.reels.every((r) => r.spinOffset === 0 && r.settle === 0)).toBe(true);
    expect(viewAt(timeline, at(event(timeline, 'injury'), 0.5)).card?.level).toBe('scuffed');
  });

  it('plays the Session: intro, free spins, climbs and pain on the bar, the closing card filmed by a friend, the total', () => {
    const timeline = timelineOf(SEEDS.session);
    const result = firstSpin(SEEDS.session);
    const session = result.session!;

    const intro = viewAt(timeline, at(event(timeline, 'session-intro'), 0.5));
    expect(intro.card?.title).toBe('THE SESSION');
    expect(intro.card?.lines).toContain(`${session.startingSpins} free spins`);

    const free = event(timeline, 'free-spin', 1);
    const freeView = viewAt(timeline, at(free, 0.5));
    expect(freeView.card?.title).toBe('FREE SPIN 2');
    expect(freeView.session?.ladder).toEqual(session.spins[1]!.ladderBefore);

    const climb = event(timeline, 'ladder-climb');
    expect(viewAt(timeline, at(climb, 0.5)).session?.ladder).toEqual(climb.to);
    const pain = event(timeline, 'pain');
    const painView = viewAt(timeline, at(pain, 0.5));
    expect(painView.card?.title).toBe('PAIN');
    expect(painView.session?.spinsLeft).toBe(pain.spinsLeftAfter);

    const closing = viewAt(timeline, at(event(timeline, 'closing-card'), 0.5)).card!;
    expect(closing.friendFilming).toBe(true);
    expect(closing.level).toBe('patched-up');
    expect(closing.heldFrame?.injuryId).toBe(session.closing.id);

    const total = viewAt(timeline, at(event(timeline, 'session-total'), 0.5));
    expect(total.card?.lines).toEqual([(session.totalWinCoins * BET).toLocaleString('en-US')]);
  });

  it('shows broken only on Full gore; Mild shows the patch-up in its place and draws no blood', () => {
    const full = timelineOf(SEEDS.broken);
    const mild = timelineOf(SEEDS.broken, { ...FULL, gore: 'mild' });
    const levels = (timeline: Timeline): string[] => {
      const seen: string[] = [];
      for (let t = 0; t <= timeline.duration; t += 10) {
        const card = viewAt(timeline, t).card;
        if (card !== null && card.level !== null && seen.at(-1) !== `${card.kind}:${card.level}`) seen.push(`${card.kind}:${card.level}`);
      }
      return seen;
    };
    expect(levels(full)).toContain('injury:broken');
    expect(levels(mild)).not.toContain('injury:broken');
    const replaced = mild.events.find((e) => e.kind === 'patch-up' && e.replaces !== null)!;
    const card = viewAt(mild, at(replaced, 0.5)).card!;
    expect(card.title).toBe('PATCHED UP');
    expect(card.lines.join(' ')).toMatch(/bad/);
    for (let t = 0; t <= mild.duration; t += 25) {
      const c = viewAt(mild, t).card;
      if (c !== null && c.heldFrame !== null) expect(c.bloodHidden).toBe(true);
    }
  });

  it('counts the win up to the total and ends on the timeline final state', () => {
    for (const text of Object.values(SEEDS)) {
      const timeline = timelineOf(text);
      const result = firstSpin(text);
      const count = event(timeline, 'count-up');
      const before = viewAt(timeline, count.start - 1);
      expect(before.winCredits).toBe(0);
      const mid = viewAt(timeline, at(count, 0.5));
      expect(mid.countingUp).toBe(true);
      expect(mid.winCredits).toBeLessThanOrEqual(result.totalWinCoins * BET);
      const end = viewAt(timeline, timeline.duration + 500);
      expect(end.done).toBe(true);
      expect(end.activeKind).toBeNull();
      expect(end.winCredits).toBe(result.totalWinCoins * BET);
      expect(end.scarCard.marks).toBe(timeline.final.scarCardMarks);
      expect(end.reels.map((r) => r.symbols)).toEqual(sceneAt(timeline, timeline.duration).reels);
      expect(end.card).toBeNull();
      expect(end.rider).toBeNull();
    }
  });
});
