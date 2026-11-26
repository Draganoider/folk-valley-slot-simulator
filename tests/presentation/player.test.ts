import { describe, expect, it } from 'vitest';
import { createRng, seedFromText } from '../../src/engine';
import {
  ManualClock,
  TimelinePlayer,
  activeAt,
  buildTimeline,
  progressAt,
  sceneAt,
  type PlayerFrame,
  type Timeline,
} from '../../src/presentation';
import { sampleResults } from './sample';

const SAMPLE = sampleResults(4_000);
const SESSION = SAMPLE.find((r) => r.session !== null && r.session.spins.length > 2)!;
const LANDED = SAMPLE.find((r) => r.base.attempt?.outcome === 'landed' && r.totalWinCoins > 0)!;
const TIMELINES: Timeline[] = [SESSION, LANDED, ...SAMPLE.slice(0, 50)].map((r) => buildTimeline(r));

/** Plays to the end in frames of pseudo-random length, as a browser's rAF would. */
function playThrough(t: Timeline, seed: number, speed = 1): { frames: PlayerFrame[]; clockMs: number } {
  const clock = new ManualClock(1000);
  const player = new TimelinePlayer(t, clock, { speed });
  const rng = createRng(seedFromText(`frames-${seed}`));
  const frames: PlayerFrame[] = [player.tick()];
  let clockMs = 0;
  while (!player.done) {
    const step = 1 + rng.nextInt(40);
    clock.advance(step);
    clockMs += step;
    frames.push(player.tick());
  }
  return { frames, clockMs };
}

describe('activeAt, progressAt and sceneAt', () => {
  it('finds exactly the event covering each time', () => {
    for (const t of TIMELINES) {
      for (const e of t.events) {
        expect(activeAt(t, e.start)).toEqual([e]);
        expect(activeAt(t, e.start + e.duration - 0.5)).toEqual([e]);
      }
      expect(activeAt(t, t.duration)).toEqual([]);
      expect(progressAt(t, 0)).toBe(0);
      expect(progressAt(t, t.duration / 2)).toBeCloseTo(0.5);
      expect(progressAt(t, t.duration * 2)).toBe(1);
    }
  });

  it('ends on the final state', () => {
    for (const t of TIMELINES) {
      const end = sceneAt(t, t.duration);
      expect(end.winCoins).toBe(t.final.totalWinCoins);
      expect(end.scarCard).toEqual({ marks: t.final.scarCardMarks, size: t.final.scarCardSize });
      expect(end.session !== null).toBe(t.final.sessionPlayed);
      expect(end.reels.every((w) => w !== null)).toBe(true);
    }
    const s = buildTimeline(SESSION);
    const end = sceneAt(s, s.duration).session!;
    expect(end.totalCoins).toBe(SESSION.session!.totalWinCoins);
    expect(end.ladder).toEqual(SESSION.session!.spins.at(-1)!.ladderAfter);
    expect(end.ended).toBe(true);
  });

  it('counts the win meter up during the count-up only', () => {
    const t = buildTimeline(LANDED);
    const count = t.events.at(-1)!;
    expect(sceneAt(t, count.start - 1).winCoins).toBe(0);
    const mid = sceneAt(t, count.start + count.duration / 2).winCoins;
    expect(mid).toBeGreaterThanOrEqual(0);
    expect(mid).toBeLessThanOrEqual(LANDED.totalWinCoins);
    expect(sceneAt(t, t.duration).winCoins).toBe(LANDED.totalWinCoins);
  });
});

describe('TimelinePlayer', () => {
  it('reports every event entered and completed exactly once, in order, however the frames fall', () => {
    for (const [i, t] of TIMELINES.entries()) {
      for (const speed of [1, 2.5, 40]) {
        const { frames } = playThrough(t, i, speed);
        expect(frames.flatMap((f) => f.entered)).toEqual(t.events);
        expect(frames.flatMap((f) => f.completed)).toEqual(t.events);
        const last = frames.at(-1)!;
        expect([last.time, last.progress, last.done, last.active]).toEqual([t.duration, 1, true, []]);
      }
    }
  });

  it('is deterministic under a fake clock', () => {
    const t = TIMELINES[0]!;
    expect(playThrough(t, 7)).toEqual(playThrough(t, 7));
    expect(playThrough(t, 7, 3)).toEqual(playThrough(t, 7, 3));
  });

  it('treats speed as presentation milliseconds per clock millisecond', () => {
    const t = TIMELINES[0]!;
    const clock = new ManualClock();
    const player = new TimelinePlayer(t, clock, { speed: 2 });
    clock.advance(100);
    expect(player.tick().time).toBe(200);
    player.setSpeed(0.5);
    clock.advance(100);
    expect(player.tick().time).toBe(250);
    const normal = playThrough(t, 1, 1).clockMs;
    const fast = playThrough(t, 1, 4).clockMs;
    expect(fast).toBeLessThan(normal / 3);
    expect(() => player.setSpeed(0)).toThrow(RangeError);
  });

  it('skip lands on the final state and still reports every outcome', () => {
    for (const t of TIMELINES) {
      const clock = new ManualClock();
      const player = new TimelinePlayer(t, clock);
      clock.advance(t.events[2]!.start + 1);
      const first = player.tick();
      const skipped = player.skip();
      expect([...first.completed, ...skipped.completed]).toEqual(t.events);
      expect(skipped.done).toBe(true);
      expect(skipped.time).toBe(t.duration);
      expect(skipped.scene).toEqual(sceneAt(t, t.duration));
      expect(skipped.scene.winCoins).toBe(t.final.totalWinCoins);
      expect(skipped.scene.scarCard.marks).toBe(t.final.scarCardMarks);
      // Time does not run past the end.
      clock.advance(10_000);
      expect(player.tick().time).toBe(t.duration);
    }
  });

  it('skips to each skip point in turn', () => {
    const t = buildTimeline(SESSION);
    const player = new TimelinePlayer(t, new ManualClock());
    const points = t.events.filter((e) => e.skipPoint).map((e) => e.start + e.duration);
    const reached: number[] = [];
    while (!player.done) reached.push(player.skipToNextPoint().time);
    expect(reached).toEqual(points);
    expect(points.at(-1)).toBe(t.duration);
  });

  it('pauses, resumes and seeks back', () => {
    const t = TIMELINES[0]!;
    const clock = new ManualClock();
    const player = new TimelinePlayer(t, clock, { paused: true });
    clock.advance(500);
    expect(player.tick().time).toBe(0);
    player.resume();
    clock.advance(300);
    expect(player.tick().time).toBe(300);
    player.pause();
    clock.advance(300);
    expect(player.tick().time).toBe(300);

    const forward = player.seek(t.duration - 1);
    expect(forward.completed.length).toBeGreaterThan(0);
    const back = player.seek(10);
    expect([back.rewound, back.entered, back.completed, back.time]).toEqual([true, [], [], 10]);
    expect(back.scene).toEqual(sceneAt(t, 10));
    // Playing on from the rewind reports the later events again.
    const end = player.skip();
    expect(end.completed[0]).toEqual(t.events.find((e) => e.start + e.duration > 10));
  });
});
