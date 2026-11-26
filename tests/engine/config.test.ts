import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  INJURY_CATALOGUE,
  INJURY_LEVELS,
  PLACEHOLDER_CONFIG,
  assertValidConfig,
  maxWinCoins,
  validateConfig,
  type ValidationError,
} from '../../src/engine';

/** A mutable deep copy of the placeholder, to break one thing at a time. Untyped on purpose. */
type Loose = any;
function copy(): Loose {
  return JSON.parse(JSON.stringify(PLACEHOLDER_CONFIG));
}

function errorsOf(config: unknown): readonly ValidationError[] {
  const result = validateConfig(config);
  return result.ok ? [] : result.errors;
}

/** Expects the config to be refused with an error at `path` whose message contains `text`. */
function expectRejected(config: unknown, path: string, text: string): void {
  const errors = errorsOf(config);
  expect(errors.length, 'the configuration should have been refused').toBeGreaterThan(0);
  const match = errors.find((e) => e.path === path && e.message.includes(text));
  expect(match, `no error at ${path} mentioning "${text}"; got ${JSON.stringify(errors, null, 2)}`).toBeDefined();
}

describe('the placeholder configuration', () => {
  it('validates', () => {
    expect(errorsOf(PLACEHOLDER_CONFIG)).toEqual([]);
  });

  it('survives a JSON round trip and still validates', () => {
    expect(errorsOf(copy())).toEqual([]);
  });

  it('has the DR-005 and DR-006 shape', () => {
    expect(PLACEHOLDER_CONFIG.grid).toEqual({ reels: 5, rows: 3 });
    expect(PLACEHOLDER_CONFIG.session.painLimit).toBe(3);
    expect(PLACEHOLDER_CONFIG.maxWinMultiplier).toBe(2500);
    expect(maxWinCoins(PLACEHOLDER_CONFIG)).toBe(2500 * PLACEHOLDER_CONFIG.bet.coinsPerSpin);
    expect(PLACEHOLDER_CONFIG.scarCard.persistence).toBe('per-bet-level');
  });

  it('is returned unchanged by assertValidConfig', () => {
    expect(assertValidConfig(PLACEHOLDER_CONFIG)).toBe(PLACEHOLDER_CONFIG);
  });
});

describe('the injury catalogue', () => {
  it('keeps every id at exactly one level', () => {
    const all = INJURY_LEVELS.flatMap((l) => INJURY_CATALOGUE[l]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps bent limbs and visible bone at the broken level only (rule 8)', () => {
    for (const level of INJURY_LEVELS) {
      for (const id of INJURY_CATALOGUE[level]) {
        if (/bent|fracture|bone/.test(id)) expect(level).toBe('broken');
      }
    }
  });
});

describe('rejected configurations', () => {
  it('refuses something that is not an object', () => {
    expectRejected(null, '(config)', 'must be an object');
    expectRejected([], '(config)', 'must be an object');
  });

  it('reports every problem, not only the first', () => {
    const c = copy();
    c.grid.rows = 4;
    c.maxWinMultiplier = 0;
    c.scarCard.size = 0;
    expect(errorsOf(c).length).toBeGreaterThanOrEqual(3);
  });

  it('throws a ConfigError listing the problems', () => {
    const c = copy();
    c.grid.reels = 6;
    expect(() => assertValidConfig(c)).toThrow(ConfigError);
    try {
      assertValidConfig(c);
    } catch (e) {
      expect((e as ConfigError).errors[0]?.path).toBe('grid.reels');
      expect((e as Error).message).toContain('grid.reels');
    }
  });

  describe('grid and bet', () => {
    it('only 5 × 3', () => {
      const c = copy();
      c.grid = { reels: 5, rows: 4 };
      expectRejected(c, 'grid.rows', 'must be one of 3');
    });

    it('a positive integer cost per spin', () => {
      const c = copy();
      c.bet.coinsPerSpin = 0;
      expectRejected(c, 'bet.coinsPerSpin', 'between 1');
    });

    it('strictly ascending bet levels', () => {
      const c = copy();
      c.bet.levels = [1, 5, 5];
      expectRejected(c, 'bet.levels[2]', 'strictly ascending');
      c.bet.levels = [];
      expectRejected(c, 'bet.levels', 'at least one');
    });
  });

  describe('symbols and paytable', () => {
    it('exactly one wild', () => {
      const c = copy();
      c.symbols.push({ id: 'kicker-2', kind: 'wild' });
      expectRejected(c, 'symbols', 'exactly 1 wild');
    });

    it('riders are the four riders', () => {
      const c = copy();
      c.symbols[0].id = 'tony';
      expectRejected(c, 'symbols[0].id', 'one of the riders');
    });

    it('no duplicate symbol ids', () => {
      const c = copy();
      c.symbols[9].id = 'bolt';
      expectRejected(c, 'symbols[9].id', 'duplicate');
    });

    it('a pay for every paying symbol', () => {
      const c = copy();
      delete c.paytable.cone;
      expectRejected(c, 'paytable.cone', 'needs pays');
    });

    it('no pay for the wild or the scatter', () => {
      const c = copy();
      c.paytable.flyer = { 3: 1, 4: 2, 5: 3 };
      expectRejected(c, 'paytable.flyer', 'pays nothing');
    });

    it('integer pays, never fractions', () => {
      const c = copy();
      c.paytable.gramps[3] = 2.5;
      expectRejected(c, 'paytable.gramps.3', 'must be an integer');
    });

    it('a longer run never pays less', () => {
      const c = copy();
      c.paytable.kerb = { 3: 30, 4: 20, 5: 50 };
      expectRejected(c, 'paytable.kerb', 'never pay less');
    });

    it('no pay for a symbol that does not exist', () => {
      const c = copy();
      c.paytable.ghost = { 3: 1, 4: 2, 5: 3 };
      expectRejected(c, 'paytable.ghost', 'not a symbol');
    });
  });

  describe('reel strips', () => {
    it('five strips', () => {
      const c = copy();
      c.reels.pop();
      expectRejected(c, 'reels', 'one strip per reel');
    });

    it('known symbols only', () => {
      const c = copy();
      c.reels[2][4] = 'banana';
      expectRejected(c, 'reels[2][4]', 'not a symbol');
    });

    it('the Kicker only on reels 2–4', () => {
      const c = copy();
      c.reels[0][3] = 'kicker';
      expectRejected(c, 'reels[0][3]', 'reels 2–4');
      const d = copy();
      d.session.reels[4][0] = 'kicker';
      expectRejected(d, 'session.reels[4][0]', 'reels 2–4');
    });

    it('at most one Flyer per window', () => {
      const c = copy();
      const strip: string[] = c.reels[1];
      const at = strip.indexOf('flyer');
      strip[at + 2] = 'flyer';
      expectRejected(c, 'reels[1]', 'one window');
    });

    it('at most one Flyer per window across the wrap', () => {
      const c = copy();
      const strip: string[] = c.reels[0].map((s: string) => (s === 'flyer' ? 'bolt' : s));
      strip[0] = 'flyer';
      strip[strip.length - 1] = 'flyer';
      c.reels[0] = strip;
      expectRejected(c, 'reels[0]', 'one window');
    });

    it('enough stops to fill the window', () => {
      const c = copy();
      c.reels[3] = ['bolt', 'cone'];
      expectRejected(c, 'reels[3]', 'at least 3 stops');
    });
  });

  describe('riders and trick tiers', () => {
    it('all four riders, once each', () => {
      const c = copy();
      c.riders[3].id = 'kerb';
      expectRejected(c, 'riders[3].id', 'duplicate');
      expectRejected(c, 'riders', '"dot" is missing');
    });

    it('rider weights that can be drawn', () => {
      const c = copy();
      for (const r of c.riders) r.weight = 0;
      expectRejected(c, 'riders', 'must not all be zero');
    });

    it('integer land and bail weights, not probabilities', () => {
      const c = copy();
      c.trickTiers[1].odds = { land: 0.4, bail: 0.6 };
      expectRejected(c, 'trickTiers[1].odds.land', 'must be an integer');
    });

    it('weights that sum to at most 2^32', () => {
      const c = copy();
      c.trickTiers[0].odds = { land: 2 ** 32, bail: 1 };
      expectRejected(c, 'trickTiers[0].odds', 'at most 2^32');
    });

    it('the tiers easy, medium, hard in order', () => {
      const c = copy();
      [c.trickTiers[0], c.trickTiers[2]] = [c.trickTiers[2], c.trickTiers[0]];
      expectRejected(c, 'trickTiers[0].id', 'expected "easy"');
    });

    it('a landing adds at most the other two wild-eligible reels', () => {
      const c = copy();
      c.trickTiers[2].landing.extraWildReels = 3;
      expectRejected(c, 'trickTiers[2].landing.extraWildReels', 'between 0 and 2');
    });

    it('a multiplier of at least 1', () => {
      const c = copy();
      c.trickTiers[2].landing.winMultiplier = 0;
      expectRejected(c, 'trickTiers[2].landing.winMultiplier', 'between 1');
    });
  });

  describe('Scar Card', () => {
    it('a size of at least one', () => {
      const c = copy();
      c.scarCard.size = 0;
      expectRejected(c, 'scarCard.size', 'between 1');
    });

    it('one card per bet level', () => {
      const c = copy();
      c.scarCard.persistence = 'shared';
      expectRejected(c, 'scarCard.persistence', '"per-bet-level"');
    });
  });

  describe('Session', () => {
    it('a pain limit of 3', () => {
      const c = copy();
      c.session.painLimit = 4;
      expectRejected(c, 'session.painLimit', 'must be one of 3');
    });

    it('multipliers that never fall', () => {
      const c = copy();
      c.session.rungs[3].multiplier = 2;
      expectRejected(c, 'session.rungs[3].multiplier', 'never fall');
    });

    it('start rungs on the ladder, more Flyers never lower', () => {
      const c = copy();
      c.session.startRung.flyers5 = c.session.rungs.length;
      expectRejected(c, 'session.startRung.flyers5', 'between 0');
      const d = copy();
      d.session.startRung = { flyers3: 2, flyers4: 1, flyers5: 2, scarCard: 0 };
      expectRejected(d, 'session.startRung', 'never start lower');
    });

    it('at least one starting spin', () => {
      const c = copy();
      c.session.startingSpins = 0;
      expectRejected(c, 'session.startingSpins', 'between 1');
    });
  });

  describe('injuries (DR-009)', () => {
    it('base-game bails stay scuffed', () => {
      const c = copy();
      c.injuries.baseBail = 'bleeding';
      expectRejected(c, 'injuries.baseBail', 'only ever shows "scuffed"');
    });

    it('broken only at the pain limit', () => {
      const c = copy();
      c.injuries.sessionPain = ['scuffed', 'broken', 'broken'];
      expectRejected(c, 'injuries.sessionPain[1]', 'only for the bail that reaches the pain limit');
    });

    it('never milder as pain rises', () => {
      const c = copy();
      c.injuries.sessionPain = ['bleeding', 'scuffed', 'broken'];
      expectRejected(c, 'injuries.sessionPain[1]', 'never get milder');
    });

    it('every sequence closes patched up', () => {
      const c = copy();
      c.injuries.closing = 'broken';
      expectRejected(c, 'injuries.closing', 'patched-up');
    });

    it('no level that does not exist', () => {
      const c = copy();
      c.injuries.sessionPain = ['scuffed', 'bleeding', 'mangled'];
      expectRejected(c, 'injuries.sessionPain[2]', 'must be one of');
    });
  });

  describe('cosmetics', () => {
    it('injury ids only from the reviewed catalogue', () => {
      const c = copy();
      c.cosmetics.injuries.broken = [...c.cosmetics.injuries.broken, 'something-worse'];
      expectRejected(c, `cosmetics.injuries.broken[${c.cosmetics.injuries.broken.length - 1}]`, 'not in INJURY_CATALOGUE');
    });

    it('injury ids at their own level', () => {
      const c = copy();
      c.cosmetics.injuries.scuffed = ['scrape', 'open-fracture-shin'];
      expectRejected(c, 'cosmetics.injuries.scuffed[1]', 'is a "broken" injury');
    });

    it('at least one trick name for every discipline and tier', () => {
      const c = copy();
      c.cosmetics.tricks.skate.hard = [];
      expectRejected(c, 'cosmetics.tricks.skate.hard', 'at least one');
    });

    it('no duplicate bail animations', () => {
      const c = copy();
      c.cosmetics.bailAnimations.bmx = ['slide-out', 'slide-out'];
      expectRejected(c, 'cosmetics.bailAnimations.bmx[1]', 'duplicate');
    });
  });

  it('a max-win cap of at least 1× bet', () => {
    const c = copy();
    c.maxWinMultiplier = -5;
    expectRejected(c, 'maxWinMultiplier', 'between 1');
  });
});
