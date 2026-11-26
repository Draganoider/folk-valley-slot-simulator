import { describe, expect, it } from 'vitest';
import {
  INJURY_CATALOGUE,
  PLACEHOLDER_CONFIG,
  RESULT_FORMAT_VERSION,
  RNG_VERSION,
  countFlyers,
  evaluateWays,
  initialPlayerState,
  maxWinCoins,
  scarCardMarks,
  spin,
  withScarCardMarks,
  type GameConfig,
  type PlayerState,
  type SpinResult,
} from '../../src/engine';
import { SEED, stubEvaluator, variant } from './helpers';

const BET = 2;

/** Every base attempt forced to one outcome, keeping the placeholder's strips. */
function forcedBase(landed: boolean, change: (c: any) => void = () => {}): GameConfig {
  return variant((c) => {
    for (const t of c.trickTiers) t.odds = landed ? { land: 1, bail: 0 } : { land: 0, bail: 1 };
    change(c);
  });
}

/** The first spin index from `from` whose base grid shows a Kicker under `config`. */
function firstKickerSpin(config: GameConfig, from = 0): number {
  const evaluator = stubEvaluator({ flyers: 0 });
  for (let i = from; i < from + 10_000; i++) {
    const { result } = spin(config, initialPlayerState(config), { masterSeed: SEED, spinIndex: i, betLevel: BET }, evaluator);
    if (result.base.attempt !== null) return i;
  }
  throw new Error('no Kicker found');
}

/** Runs `count` paid spins in a row at one bet level, carrying the state. */
function run(config: GameConfig, count: number, evaluator = stubEvaluator(), betLevel = BET) {
  let state: PlayerState = initialPlayerState(config);
  const results: SpinResult[] = [];
  for (let i = 0; i < count; i++) {
    const out = spin(config, state, { masterSeed: SEED, spinIndex: i, betLevel }, evaluator);
    results.push(out.result);
    state = out.state;
  }
  return { results, state };
}

describe('spin: reproducibility', () => {
  it('replays a whole spin, Session included, from the same inputs', () => {
    const evaluator = stubEvaluator({ flyers: 4 });
    const state = withScarCardMarks(initialPlayerState(PLACEHOLDER_CONFIG), BET, 3);
    const request = { masterSeed: SEED, spinIndex: 41, betLevel: BET };
    const a = spin(PLACEHOLDER_CONFIG, state, request, evaluator);
    const b = spin(PLACEHOLDER_CONFIG, state, request, evaluator);
    expect(a.result.session).not.toBeNull();
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(a.result))).toEqual(a.result);
    // The input state is not changed.
    expect(scarCardMarks(PLACEHOLDER_CONFIG, state, BET)).toBe(3);
  });

  it('computes any spin alone: a run gives the same results as each spin replayed by itself', () => {
    const { results } = run(PLACEHOLDER_CONFIG, 200);
    let state = initialPlayerState(PLACEHOLDER_CONFIG);
    for (const r of results) {
      state = withScarCardMarks(state, BET, r.scarCard.before);
      const alone = spin(PLACEHOLDER_CONFIG, state, { masterSeed: SEED, spinIndex: r.spinIndex, betLevel: BET }, stubEvaluator());
      expect(alone.result).toEqual(r);
    }
  });

  it('pins the draw order with a golden spin', () => {
    // Spin 41 under SEED, card at 3, four Flyers forced by the stub. If this changes, the
    // draw order changed: that breaks every recorded seed, so it needs a decision, not an
    // updated expectation (src/engine/README.md, DR-012).
    const state = withScarCardMarks(initialPlayerState(PLACEHOLDER_CONFIG), BET, 3);
    const { result } = spin(PLACEHOLDER_CONFIG, state, { masterSeed: SEED, spinIndex: 41, betLevel: BET }, stubEvaluator({ flyers: 4 }));
    const s = result.session!;
    expect({
      stops: result.base.stops,
      attempt: result.base.attempt && {
        rider: result.base.attempt.rider,
        tier: result.base.attempt.tier,
        outcome: result.base.attempt.outcome,
        wildReels: result.base.attempt.wildReels,
        trickId: result.base.attempt.trickId,
      },
      sessionRider: s.rider,
      sessionSpins: s.spins.map((sp) => `${sp.stops.join(',')} ${sp.attempt.outcome} ${sp.attempt.trickId} r${sp.ladderAfter.rung} p${sp.ladderAfter.pain}`),
      endReason: s.endReason,
      closing: s.closing.id,
      total: result.totalWinCoins,
    }).toMatchInlineSnapshot(`
      {
        "attempt": {
          "outcome": "landed",
          "rider": "gramps",
          "tier": "medium",
          "trickId": "tailwhip",
          "wildReels": [
            1,
            3,
          ],
        },
        "closing": "arm-in-sling",
        "endReason": "pain-limit",
        "sessionRider": "kerb",
        "sessionSpins": [
          "17,14,24,18,0 landed pop-shove-it r2 p0",
          "28,11,30,31,16 landed kickflip r3 p0",
          "6,7,19,10,22 landed heelflip r4 p0",
          "24,27,23,7,17 bailed 360-flip r4 p1",
          "2,18,5,24,24 bailed hardflip r4 p2",
          "14,14,17,30,27 bailed 360-flip r4 p3",
        ],
        "stops": [
          22,
          3,
          8,
          1,
          27,
        ],
        "total": 61,
      }
    `);
  });
});

describe('spin: feature paths', () => {
  it('a landed trick turns reels wild for the win and leaves the card alone', () => {
    const config = forcedBase(true);
    const i = firstKickerSpin(config);
    const evaluator = stubEvaluator({ flyers: 0, coinsPerGrid: 1, perWildReel: 10 });
    const { result, state } = spin(config, initialPlayerState(config), { masterSeed: SEED, spinIndex: i, betLevel: BET }, evaluator);
    const attempt = result.base.attempt!;
    expect(attempt.outcome).toBe('landed');
    expect(attempt.wildReels[0]).toBe(attempt.kicker.reel);
    expect(evaluator.calls[0]?.wildReels).toEqual(attempt.wildReels);
    expect(result.base.winCoins).toBe((1 + 10 * attempt.wildReels.length) * attempt.winMultiplier);
    expect(result.totalWinCoins).toBe(result.base.winCoins);
    expect(result.scarCard).toEqual({ betLevel: BET, size: 5, before: 0, after: 0, filled: false });
    expect(result.session).toBeNull();
    expect(state).toEqual(initialPlayerState(config));
  });

  it('a bail pays nothing extra and marks only the played bet level', () => {
    const config = forcedBase(false);
    const i = firstKickerSpin(config);
    const evaluator = stubEvaluator({ flyers: 0, coinsPerGrid: 0 });
    const { result, state } = spin(config, initialPlayerState(config), { masterSeed: SEED, spinIndex: i, betLevel: BET }, evaluator);
    expect(result.base.attempt?.outcome).toBe('bailed');
    expect(result.base.winCoins).toBe(0);
    expect(result.totalWinCoins).toBe(0);
    expect(result.scarCard).toEqual({ betLevel: BET, size: 5, before: 0, after: 1, filled: false });
    expect(scarCardMarks(config, state, BET)).toBe(1);
    for (const level of config.bet.levels.filter((l) => l !== BET)) expect(scarCardMarks(config, state, level)).toBe(0);
  });

  it('the bail that fills the card starts a Session in the same result and resets the card', () => {
    const config = forcedBase(false);
    const i = firstKickerSpin(config);
    const before = withScarCardMarks(initialPlayerState(config), BET, config.scarCard.size - 1);
    const { result, state } = spin(config, before, { masterSeed: SEED, spinIndex: i, betLevel: BET }, stubEvaluator({ flyers: 0 }));
    expect(result.scarCard).toEqual({ betLevel: BET, size: 5, before: 4, after: 0, filled: true });
    expect(result.session?.trigger).toEqual({ kind: 'scar-card' });
    expect(result.session?.startRung).toBe(config.session.startRung.scarCard);
    expect(scarCardMarks(config, state, BET)).toBe(0);
    expect(result.totalWinCoins).toBe(result.base.winCoins + result.session!.totalWinCoins);
  });

  it('three or more Flyers start a Session without touching the card', () => {
    for (const flyers of [3, 4, 5] as const) {
      const { result } = spin(PLACEHOLDER_CONFIG, initialPlayerState(PLACEHOLDER_CONFIG), { masterSeed: SEED, spinIndex: 7, betLevel: BET }, stubEvaluator({ flyers }));
      expect(result.base.flyers.count).toBe(flyers);
      expect(result.session?.trigger).toEqual({ kind: 'flyers', count: flyers });
    }
    const { result } = spin(PLACEHOLDER_CONFIG, initialPlayerState(PLACEHOLDER_CONFIG), { masterSeed: SEED, spinIndex: 7, betLevel: BET }, stubEvaluator({ flyers: 2 }));
    expect(result.session).toBeNull();
  });

  it('Flyers win when the same spin would fill the card, and the card holds its last mark', () => {
    const config = forcedBase(false);
    const i = firstKickerSpin(config);
    const before = withScarCardMarks(initialPlayerState(config), BET, config.scarCard.size - 1);
    const { result, state } = spin(config, before, { masterSeed: SEED, spinIndex: i, betLevel: BET }, stubEvaluator({ flyers: 3 }));
    expect(result.base.attempt?.outcome).toBe('bailed');
    expect(result.session?.trigger).toEqual({ kind: 'flyers', count: 3 });
    expect(result.scarCard).toEqual({ betLevel: BET, size: 5, before: 4, after: 4, filled: false });
    expect(scarCardMarks(config, state, BET)).toBe(4);
  });

  it('caps the whole paid spin at 2,500× its cost', () => {
    const cap = maxWinCoins(PLACEHOLDER_CONFIG);
    expect(cap).toBe(2500 * 20);
    const { result } = spin(PLACEHOLDER_CONFIG, initialPlayerState(PLACEHOLDER_CONFIG), { masterSeed: SEED, spinIndex: 3, betLevel: BET }, stubEvaluator({ flyers: 3, coinsPerGrid: 9000 }));
    expect(result.totalWinCoins).toBe(cap);
    expect(result.capped).toBe(true);
    expect(result.session?.endReason).toBe('max-win');
    expect(result.base.winCoins + result.session!.totalWinCoins).toBe(cap);
  });

  it('caps a base win above the cap and then plays no free spins', () => {
    const cap = maxWinCoins(PLACEHOLDER_CONFIG);
    const { result } = spin(PLACEHOLDER_CONFIG, initialPlayerState(PLACEHOLDER_CONFIG), { masterSeed: SEED, spinIndex: 3, betLevel: BET }, stubEvaluator({ flyers: 3, coinsPerGrid: cap + 5 }));
    expect(result.totalWinCoins).toBe(cap);
    expect(result.capped).toBe(true);
    expect(result.session?.spins).toEqual([]);
  });

  it('is not capped below the cap', () => {
    const { result } = spin(PLACEHOLDER_CONFIG, initialPlayerState(PLACEHOLDER_CONFIG), { masterSeed: SEED, spinIndex: 3, betLevel: BET }, stubEvaluator({ flyers: 0 }));
    expect(result.capped).toBe(false);
  });

  it('refuses a bet level the configuration does not offer', () => {
    expect(() => spin(PLACEHOLDER_CONFIG, initialPlayerState(PLACEHOLDER_CONFIG), { masterSeed: SEED, spinIndex: 0, betLevel: 3 }, stubEvaluator())).toThrow(RangeError);
  });
});

describe('spin: injuries come only from the catalogue', () => {
  it('every bail and closing card across many spins names a catalogued id at the right level', () => {
    // More bails and Sessions than the placeholder gives, so every level shows up.
    const config = variant((c) => {
      for (const t of c.trickTiers) t.odds = { land: 1, bail: 1 };
      for (const r of c.session.rungs) r.odds = { land: 1, bail: 2 };
    });
    const { results } = run(config, 3000);
    const levels = new Set<string>();
    let sessions = 0;
    for (const r of results) {
      const bail = r.base.attempt?.bail;
      if (bail) {
        expect(bail.injury.level).toBe('scuffed');
        expect(INJURY_CATALOGUE.scuffed).toContain(bail.injury.id);
        levels.add(bail.injury.level);
      }
      if (r.session) {
        sessions++;
        for (const sp of r.session.spins) {
          const b = sp.attempt.bail;
          if (!b) continue;
          expect(b.injury.level).toBe(config.injuries.sessionPain[sp.ladderAfter.pain - 1]);
          expect(INJURY_CATALOGUE[b.injury.level]).toContain(b.injury.id);
          levels.add(b.injury.level);
        }
        expect(r.session.closing.level).toBe('patched-up');
        expect(INJURY_CATALOGUE['patched-up']).toContain(r.session.closing.id);
        levels.add(r.session.closing.level);
      }
    }
    expect(sessions).toBeGreaterThan(0);
    expect([...levels].sort()).toEqual(['bleeding', 'broken', 'patched-up', 'scuffed']);
  });
});

/** Asserts `value` is a plain object with exactly `keys`. */
function expectKeys(value: unknown, keys: readonly string[], where: string): void {
  expect(value, where).toBeTypeOf('object');
  expect(value, where).not.toBeNull();
  expect(Object.keys(value as object).sort(), where).toEqual([...keys].sort());
}

function expectPositions(value: unknown, where: string): void {
  expect(Array.isArray(value), where).toBe(true);
  for (const p of value as unknown[]) expectKeys(p, ['reel', 'row'], where);
}

function expectWins(wins: unknown, where: string): void {
  for (const w of wins as unknown[]) {
    expectKeys(w, ['symbol', 'length', 'ways', 'payPerWay', 'coins', 'positions'], where);
    expectPositions((w as { positions: unknown }).positions, where);
  }
}

function expectBail(bail: unknown, where: string): void {
  if (bail === null) return;
  expectKeys(bail, ['animationId', 'injury'], where);
  expectKeys((bail as { injury: unknown }).injury, ['level', 'id'], where);
}

/** Checks a result against the result format, key for key, with no extra or missing fields. */
function expectResultFormat(r: SpinResult): void {
  expectKeys(r, ['formatVersion', 'rngVersion', 'configId', 'masterSeed', 'spinIndex', 'betLevel', 'costCoins', 'base', 'scarCard', 'session', 'totalWinCoins', 'capped'], 'result');
  expect(r.formatVersion).toBe(RESULT_FORMAT_VERSION);
  expect(r.rngVersion).toBe(RNG_VERSION);
  expect(r.masterSeed).toMatch(/^[0-9a-f]{16}$/);
  expectKeys(r.base, ['stops', 'grid', 'attempt', 'flyers', 'wins', 'winCoins'], 'base');
  if (r.base.attempt) {
    expectKeys(r.base.attempt, ['rider', 'tier', 'kicker', 'trickId', 'outcome', 'wildReels', 'winMultiplier', 'bail'], 'attempt');
    expectKeys(r.base.attempt.kicker, ['reel', 'row'], 'kicker');
    expect(r.base.attempt.bail === null).toBe(r.base.attempt.outcome === 'landed');
    expectBail(r.base.attempt.bail, 'attempt.bail');
  }
  expectKeys(r.base.flyers, ['count', 'positions'], 'flyers');
  expectPositions(r.base.flyers.positions, 'flyers.positions');
  expectWins(r.base.wins, 'base.wins');
  expectKeys(r.scarCard, ['betLevel', 'size', 'before', 'after', 'filled'], 'scarCard');
  if (r.session) {
    expectKeys(r.session, ['trigger', 'rider', 'startingSpins', 'startRung', 'spins', 'endReason', 'closing', 'totalWinCoins'], 'session');
    expectKeys(r.session.trigger, r.session.trigger.kind === 'flyers' ? ['kind', 'count'] : ['kind'], 'trigger');
    expectKeys(r.session.closing, ['level', 'id'], 'closing');
    for (const sp of r.session.spins) {
      expectKeys(sp, ['index', 'stops', 'grid', 'attempt', 'ladderBefore', 'ladderAfter', 'spinsLeftBefore', 'spinsAdded', 'spinsLeftAfter', 'wins', 'winCoins', 'runningTotalCoins'], 'session spin');
      expectKeys(sp.attempt, ['rider', 'rung', 'trickId', 'outcome', 'bail'], 'session attempt');
      expect(sp.attempt.bail === null).toBe(sp.attempt.outcome === 'landed');
      expectBail(sp.attempt.bail, 'session attempt.bail');
      expectKeys(sp.ladderBefore, ['rung', 'multiplier', 'pain'], 'ladderBefore');
      expectKeys(sp.ladderAfter, ['rung', 'multiplier', 'pain'], 'ladderAfter');
      expectWins(sp.wins, 'session wins');
    }
  }
  // Plain data: nothing undefined, and a JSON round trip changes nothing.
  expect(JSON.stringify(r)).not.toContain('undefined');
  expect(JSON.parse(JSON.stringify(r))).toEqual(r);
}

describe('spin: the result format', () => {
  it('matches the format exactly on every kind of spin', () => {
    const config = variant((c) => {
      for (const t of c.trickTiers) t.odds = { land: 1, bail: 1 };
    });
    const { results } = run(config, 1500);
    const kinds = new Set<string>();
    for (const r of results) {
      expectResultFormat(r);
      kinds.add(r.base.attempt?.outcome ?? 'none');
      if (r.session) kinds.add(`session-${r.session.trigger.kind}`);
      expect(r.totalWinCoins).toBe(Math.min(r.base.winCoins + (r.session?.totalWinCoins ?? 0), maxWinCoins(config)));
    }
    expect(kinds).toEqual(new Set(['none', 'landed', 'bailed', 'session-flyers', 'session-scar-card']));
  });
});

describe('spin: with the real evaluator', () => {
  it('wires the evaluator in: base pays, Flyers and every Session spin agree with it', () => {
    let state = initialPlayerState(PLACEHOLDER_CONFIG);
    let paid = 0;
    let sessions = 0;
    for (let i = 0; i < 3000; i++) {
      const { result: r, state: next } = spin(PLACEHOLDER_CONFIG, state, { masterSeed: SEED, spinIndex: i, betLevel: BET });
      state = next;
      expectResultFormat(r);
      const wild = r.base.attempt?.wildReels ?? [];
      expect(r.base.wins).toEqual(evaluateWays(PLACEHOLDER_CONFIG, r.base.grid, wild));
      const coins = r.base.wins.reduce((t, w) => t + w.coins, 0);
      expect(r.base.winCoins).toBe(coins * (r.base.attempt?.winMultiplier ?? 1));
      expect(r.base.flyers).toEqual(countFlyers(PLACEHOLDER_CONFIG, r.base.grid));
      if (r.session) {
        sessions++;
        for (const sp of r.session.spins) {
          expect(sp.wins).toEqual(evaluateWays(PLACEHOLDER_CONFIG, sp.grid, []));
          if (!r.capped) expect(sp.winCoins).toBe(sp.wins.reduce((t, w) => t + w.coins, 0) * sp.ladderAfter.multiplier);
        }
      }
      paid += r.totalWinCoins;
    }
    expect(sessions).toBeGreaterThan(0);
    expect(paid).toBeGreaterThan(0);
  });

  it('pins a short run with the real pays', () => {
    // A golden over 500 paid spins: total paid, and how many spins had each feature. If
    // this changes without a change to the draw order or the evaluator, something is wrong.
    let state = initialPlayerState(PLACEHOLDER_CONFIG);
    const summary = { paid: 0, attempts: 0, landed: 0, sessions: 0, freeSpins: 0 };
    for (let i = 0; i < 500; i++) {
      const { result: r, state: next } = spin(PLACEHOLDER_CONFIG, state, { masterSeed: SEED, spinIndex: i, betLevel: BET });
      state = next;
      summary.paid += r.totalWinCoins;
      if (r.base.attempt) summary.attempts++;
      if (r.base.attempt?.outcome === 'landed') summary.landed++;
      if (r.session) {
        summary.sessions++;
        summary.freeSpins += r.session.spins.length;
      }
    }
    expect(summary).toMatchInlineSnapshot(`
      {
        "attempts": 217,
        "freeSpins": 183,
        "landed": 112,
        "paid": 10061,
        "sessions": 29,
      }
    `);
  });
});
