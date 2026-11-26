import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_CONFIG,
  Simulation,
  mergeOutcomes,
  mergeStats,
  runSimulation,
  splitJob,
  withScarCardMarks,
  initialPlayerState,
} from '../../src/engine';
import type { SimulationJob, SpinFunction } from '../../src/engine';
import { spin as fakeSpin } from '../support/fake-spin';
import { SEED } from '../support/results';

const config = PLACEHOLDER_CONFIG;

function job(over: Partial<SimulationJob> = {}): SimulationJob {
  return { masterSeed: SEED, startIndex: 0, count: 4000, betLevel: 1, laneLength: 500, initialState: null, ...over };
}

describe('runSimulation', () => {
  it('is deterministic: the same job gives the same outcome', () => {
    expect(runSimulation(fakeSpin, config, job())).toEqual(runSimulation(fakeSpin, config, job()));
  });

  it('plays exactly the requested spin indices, carrying the card between them', () => {
    const seen: number[] = [];
    const marks: number[] = [];
    const spy: SpinFunction = (c, state, request) => {
      seen.push(request.spinIndex);
      marks.push(state.scarCards['1'] ?? -1);
      return fakeSpin(c, state, request);
    };
    const out = runSimulation(spy, config, job({ startIndex: 37, count: 100, laneLength: null }));
    expect(seen).toEqual(Array.from({ length: 100 }, (_, i) => 37 + i));
    expect(out.completed).toBe(100);
    expect(out.cancelled).toBe(false);
    expect(out.stats.firstSpinIndex).toBe(37);
    expect(out.stats.lastSpinIndex).toBe(136);
    expect(new Set(marks).size).toBeGreaterThan(1); // the card really moved
  });

  it('resets the card to empty at every lane boundary, and nowhere else', () => {
    const resets: number[] = [];
    let previousAfter: number | null = null;
    const spy: SpinFunction = (c, state, request) => {
      const before = state.scarCards['1'] ?? 0;
      if (previousAfter !== null && before !== previousAfter) resets.push(request.spinIndex);
      const out = fakeSpin(c, state, request);
      previousAfter = out.state.scarCards['1'] ?? 0;
      return out;
    };
    runSimulation(spy, config, job({ startIndex: 120, count: 400, laneLength: 100 }));
    // A visible reset needs a non-empty card just before it; every one found is on a boundary.
    expect(resets.length).toBeGreaterThan(0);
    for (const i of resets) expect(i % 100).toBe(0);
  });

  it('starts from the given state', () => {
    const initialState = withScarCardMarks(initialPlayerState(config), 1, 4);
    let first: number | null = null;
    const spy: SpinFunction = (c, state, request) => {
      first ??= state.scarCards['1'] ?? null;
      return fakeSpin(c, state, request);
    };
    runSimulation(spy, config, job({ count: 3, initialState }));
    expect(first).toBe(4);
  });

  it('a later range equals the same range inside a longer run, from a lane boundary', () => {
    const long = runSimulation(fakeSpin, config, job({ startIndex: 0, count: 1500 }));
    const head = runSimulation(fakeSpin, config, job({ startIndex: 0, count: 1000 }));
    const tail = runSimulation(fakeSpin, config, job({ startIndex: 1000, count: 500 }));
    expect(mergeStats(head.stats, tail.stats)).toEqual(long.stats);
  });

  it('reports progress and stops when cancelled, with the spins played so far', () => {
    const calls: number[] = [];
    let polls = 0;
    const out = runSimulation(fakeSpin, config, job({ count: 10_000 }), {
      progressEvery: 250,
      onProgress: (done) => calls.push(done),
      isCancelled: () => ++polls > 4,
    });
    expect(calls).toEqual([250, 500, 750, 1000]);
    expect(out.cancelled).toBe(true);
    expect(out.completed).toBe(1000);
    expect(out.stats).toEqual(runSimulation(fakeSpin, config, job({ count: 1000 })).stats);
  });

  it('refuses a bad job', () => {
    expect(() => runSimulation(fakeSpin, config, job({ masterSeed: '0123456789ABCDEF' }))).toThrow(/canonical/);
    expect(() => runSimulation(fakeSpin, config, job({ betLevel: 3 }))).toThrow(/Bet level/);
    expect(() => runSimulation(fakeSpin, config, job({ count: -1 }))).toThrow(/count/);
    expect(() => runSimulation(fakeSpin, config, job({ startIndex: 1.5 }))).toThrow(/startIndex/);
    expect(() => runSimulation(fakeSpin, config, job({ laneLength: 0 }))).toThrow(/laneLength/);
  });

  it('refuses a spin function that answers for the wrong spin', () => {
    const wrong: SpinFunction = (c, s, r) => fakeSpin(c, s, { ...r, spinIndex: r.spinIndex + 1 });
    expect(() => runSimulation(wrong, config, job({ count: 2 }))).toThrow(/Asked for spin 0/);
  });

  it('can be driven step by step', () => {
    const sim = new Simulation(fakeSpin, config, job({ count: 10 }));
    expect(sim.step(4)).toBe(false);
    expect(sim.completed).toBe(4);
    expect(sim.step(100)).toBe(true);
    expect(sim.outcome()).toEqual(runSimulation(fakeSpin, config, job({ count: 10 })));
  });
});

describe('splitJob', () => {
  it('cuts only on lane boundaries and covers the run exactly', () => {
    const j = job({ startIndex: 130, count: 1000, laneLength: 100 }); // spins 130–1129
    for (const parts of [1, 2, 3, 4, 7, 11, 50]) {
      const chunks = splitJob(j, parts);
      // At most one chunk per lane segment: the head 130–199, then 200, 300, … 1100.
      expect(chunks.length).toBeLessThanOrEqual(Math.min(parts, 11));
      if (parts <= 4) expect(chunks.length).toBe(parts);
      expect(chunks[0]?.startIndex).toBe(130);
      let next = 130;
      for (const [i, c] of chunks.entries()) {
        expect(c.startIndex).toBe(next);
        if (i > 0) expect(c.startIndex % 100).toBe(0);
        if (i > 0) expect(c.initialState).toBeNull();
        expect(c.count).toBeGreaterThan(0);
        next += c.count;
      }
      expect(next).toBe(1130);
    }
  });

  it('balances spins, not lanes, so a ragged head or tail does not skew it', () => {
    const chunks = splitJob(job({ startIndex: 250, count: 2_000_000, laneLength: 1000 }), 4);
    for (const c of chunks) expect(Math.abs(c.count - 500_000)).toBeLessThanOrEqual(1000);
  });

  it('keeps a one-lane or a one-segment job whole', () => {
    expect(splitJob(job({ laneLength: null }), 8)).toHaveLength(1);
    expect(splitJob(job({ startIndex: 10, count: 50, laneLength: 100 }), 8)).toHaveLength(1);
    expect(splitJob(job({ count: 0 }), 8)).toHaveLength(1);
  });

  it('merged chunks equal the single-thread run exactly', () => {
    const initialState = withScarCardMarks(initialPlayerState(config), 1, 3);
    const cases: Partial<SimulationJob>[] = [
      { startIndex: 0, count: 4000, laneLength: 500 },
      { startIndex: 123, count: 3001, laneLength: 250, initialState },
      { startIndex: 999, count: 2002, laneLength: 1 },
      { startIndex: 5, count: 1200, laneLength: 7 },
    ];
    for (const c of cases) {
      const j = job(c);
      const single = runSimulation(fakeSpin, config, j);
      for (const parts of [2, 3, 5, 8]) {
        const chunks = splitJob(j, parts);
        const merged = mergeOutcomes(j, chunks.map((chunk) => runSimulation(fakeSpin, config, chunk)));
        expect(merged).toEqual(single);
        expect(JSON.stringify(merged.stats)).toBe(JSON.stringify(single.stats));
      }
    }
  });

  it('a split that ignored the card would not be exact, which is why lanes exist', () => {
    // One lane, cut naively in the middle with an empty card: the second half starts from
    // the wrong state, and the fake spin, like the real one, depends on it.
    const j = job({ count: 4000, laneLength: null });
    const single = runSimulation(fakeSpin, config, j);
    const naive = mergeOutcomes(j, [
      runSimulation(fakeSpin, config, { ...j, count: 2001 }),
      runSimulation(fakeSpin, config, { ...j, startIndex: 2001, count: 1999 }),
    ]);
    expect(naive.stats).not.toEqual(single.stats);
  });
});
