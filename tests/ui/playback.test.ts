import { describe, expect, it } from 'vitest';
import { FOLK_VALLEY_CONFIG, formatSeed, initialPlayerState, seedFromText, spin } from '../../src/engine';
import { buildTimeline, ManualClock, type PlayerFrame } from '../../src/presentation';
import { Playback, speedFor, stepsShown, type FrameScheduler } from '../../src/ui/game/playback';

const CONFIG = FOLK_VALLEY_CONFIG;

function timelineOf(text: string) {
  const { result } = spin(CONFIG, initialPlayerState(CONFIG), { masterSeed: formatSeed(seedFromText(text)), spinIndex: 0, betLevel: 1 });
  return buildTimeline(result, { gore: 'full', reducedMotion: false, turbo: false });
}

/** Runs one queued frame at a time, 16 ms of clock apart, like requestAnimationFrame. */
function frames(clock: ManualClock) {
  let queue: { handle: number; callback: () => void }[] = [];
  let next = 1;
  const scheduler: FrameScheduler = {
    request(callback) {
      queue.push({ handle: next, callback });
      return next++;
    },
    cancel(handle) {
      queue = queue.filter((q) => q.handle !== handle);
    },
  };
  const step = (): boolean => {
    const job = queue.shift();
    if (job === undefined) return false;
    clock.advance(16);
    job.callback();
    return true;
  };
  return { scheduler, step, pending: () => queue.length };
}

describe('Playback', () => {
  it('plays from time 0 to the end, visiting every event once, then stops', () => {
    const timeline = timelineOf('fv-bail-5');
    const clock = new ManualClock();
    const loop = frames(clock);
    const seen: PlayerFrame[] = [];
    let done = 0;
    const playback = new Playback(timeline, clock, loop.scheduler, { onFrame: (f) => seen.push(f), onDone: () => done++ });
    playback.start();
    expect(seen[0]?.time).toBe(0);
    while (loop.step());
    expect(done).toBe(1);
    expect(seen.at(-1)?.done).toBe(true);
    expect(seen.flatMap((f) => f.completed.map((e) => e.id))).toEqual(timeline.events.map((e) => e.id));
    expect(loop.pending()).toBe(0);
  });

  it('turbo plays the same events in less clock time', () => {
    const timeline = timelineOf('fv-bail-5');
    const run = (speed: number): number => {
      const clock = new ManualClock();
      const loop = frames(clock);
      let count = 0;
      new Playback(timeline, clock, loop.scheduler, { onFrame: () => count++, onDone: () => {} }, { speed }).start();
      while (loop.step());
      return count;
    };
    expect(speedFor(true)).toBe(2.5);
    expect(run(speedFor(true))).toBeLessThan(run(speedFor(false)) / 2);
  });

  it('skip reaches the end at once, reports every remaining event and finishes once', () => {
    const timeline = timelineOf('fv-session-532');
    const clock = new ManualClock();
    const loop = frames(clock);
    const seen: PlayerFrame[] = [];
    let done = 0;
    const playback = new Playback(timeline, clock, loop.scheduler, { onFrame: (f) => seen.push(f), onDone: () => done++ });
    playback.start();
    for (let i = 0; i < 20; i++) loop.step();
    playback.skip();
    playback.skip();
    expect(done).toBe(1);
    expect(loop.pending()).toBe(0);
    expect(seen.at(-1)?.time).toBe(timeline.duration);
    expect(seen.flatMap((f) => f.completed.map((e) => e.id))).toEqual(timeline.events.map((e) => e.id));
  });
});

describe('stepsShown', () => {
  it('tells the text a step only once the scene has resolved it', () => {
    const timeline = timelineOf('fv-session-532');
    const spins = timeline.events.filter((e) => e.kind === 'free-spin').length;
    expect(stepsShown(timeline, 0)).toBe(0);
    const firstFree = timeline.events.find((e) => e.kind === 'free-spin')!;
    expect(stepsShown(timeline, firstFree.start - 1)).toBe(0);
    expect(stepsShown(timeline, firstFree.start)).toBe(1);
    const second = timeline.events.filter((e) => e.kind === 'free-spin')[1]!;
    expect(stepsShown(timeline, second.start)).toBe(2);
    expect(stepsShown(timeline, timeline.duration)).toBe(1 + spins);
    const plain = timelineOf('fv-plain-0');
    expect(stepsShown(plain, 0)).toBe(0);
    expect(stepsShown(plain, plain.duration)).toBe(1);
  });
});
