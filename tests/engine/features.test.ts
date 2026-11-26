import { describe, expect, it } from 'vitest';
import {
  INJURY_CATALOGUE,
  PLACEHOLDER_CONFIG,
  WILD_REELS,
  findKicker,
  nextScarCard,
  parseSeed,
  resolveBaseTrick,
  resolveSession,
  spinStreams,
  type GameConfig,
  type SessionTrigger,
} from '../../src/engine';
import { SEED, gridFromRows, stubEvaluator, variant } from './helpers';

const streams = (i = 0) => spinStreams(parseSeed(SEED), i);

const KICKER_GRID = gridFromRows([
  ['bolt', 'cone', 'wrench', 'kicker', 'deck'],
  ['bolt', 'pegs', 'kicker', 'kicker', 'deck'],
  ['bolt', 'pegs', 'cone', 'helmet', 'deck'],
]);
const NO_KICKER_GRID = gridFromRows([
  ['bolt', 'cone', 'wrench', 'helmet', 'deck'],
  ['bolt', 'pegs', 'flyer', 'sticker', 'deck'],
  ['bolt', 'pegs', 'cone', 'helmet', 'deck'],
]);

/** The placeholder with every attempt forced to one tier and one outcome. */
function forcedTier(tier: 'easy' | 'medium' | 'hard', landed: boolean): GameConfig {
  return variant((c) => {
    for (const t of c.trickTiers) {
      t.weight = t.id === tier ? 1 : 0;
      t.odds = landed ? { land: 1, bail: 0 } : { land: 0, bail: 1 };
    }
  });
}

/** The placeholder with every Session attempt forced to land or to bail. */
function forcedLadder(landed: boolean, change: (c: any) => void = () => {}): GameConfig {
  return variant((c) => {
    for (const r of c.session.rungs) r.odds = landed ? { land: 1, bail: 0 } : { land: 0, bail: 1 };
    change(c);
  });
}

describe('the base-game trick attempt', () => {
  it('starts from the leftmost Kicker, topmost on its reel, and is null without one', () => {
    expect(findKicker(PLACEHOLDER_CONFIG, KICKER_GRID)).toEqual({ reel: 2, row: 1 });
    expect(resolveBaseTrick(PLACEHOLDER_CONFIG, NO_KICKER_GRID, streams())).toBeNull();
    const attempt = resolveBaseTrick(PLACEHOLDER_CONFIG, KICKER_GRID, streams());
    expect(attempt?.kicker).toEqual({ reel: 2, row: 1 });
  });

  it('draws nothing when there is no Kicker', () => {
    const s = streams();
    resolveBaseTrick(PLACEHOLDER_CONFIG, NO_KICKER_GRID, s);
    const fresh = streams();
    expect(s.outcome.nextUint32()).toBe(fresh.outcome.nextUint32());
    expect(s.cosmetic.nextUint32()).toBe(fresh.cosmetic.nextUint32());
  });

  it('turns the Kicker reel wild on an easy landing and nothing else', () => {
    const config = forcedTier('easy', true);
    const attempt = resolveBaseTrick(config, KICKER_GRID, streams());
    expect(attempt).toMatchObject({ tier: 'easy', outcome: 'landed', wildReels: [2], winMultiplier: 1, bail: null });
  });

  it('adds distinct extra wild reels and the multiplier on a hard landing', () => {
    const config = forcedTier('hard', true);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const attempt = resolveBaseTrick(config, KICKER_GRID, streams(i));
      expect(attempt?.outcome).toBe('landed');
      const reels = attempt?.wildReels ?? [];
      expect(reels[0]).toBe(2); // the Kicker's own reel first
      expect(reels).toHaveLength(2);
      expect(new Set(reels).size).toBe(2);
      for (const r of reels) expect(WILD_REELS).toContain(r);
      seen.add(reels[1] as number);
      expect(attempt?.winMultiplier).toBe(2);
      const rider = config.riders.find((r) => r.id === attempt?.rider);
      expect(config.cosmetics.tricks[rider!.discipline].hard).toContain(attempt?.trickId);
    }
    expect([...seen].sort()).toEqual([1, 3]); // both other eligible reels get picked
  });

  it('shows a scuffed injury from the catalogue on a bail, and no wilds or multiplier', () => {
    const config = forcedTier('medium', false);
    for (let i = 0; i < 100; i++) {
      const attempt = resolveBaseTrick(config, KICKER_GRID, streams(i));
      expect(attempt).toMatchObject({ outcome: 'bailed', wildReels: [], winMultiplier: 1 });
      expect(attempt?.bail?.injury.level).toBe('scuffed');
      expect(INJURY_CATALOGUE.scuffed).toContain(attempt?.bail?.injury.id);
      const rider = config.riders.find((r) => r.id === attempt?.rider);
      expect(config.cosmetics.bailAnimations[rider!.discipline]).toContain(attempt?.bail?.animationId);
    }
  });

  it('draws its outcome independently of the cosmetic catalogue', () => {
    const richer = variant((c) => {
      c.cosmetics.tricks.bmx.easy.push('extra-trick-a', 'extra-trick-b');
      c.cosmetics.bailAnimations.skate.push('extra-bail');
    });
    for (let i = 0; i < 200; i++) {
      const a = resolveBaseTrick(PLACEHOLDER_CONFIG, KICKER_GRID, streams(i));
      const b = resolveBaseTrick(richer, KICKER_GRID, streams(i));
      expect([b?.rider, b?.tier, b?.outcome, b?.wildReels]).toEqual([a?.rider, a?.tier, a?.outcome, a?.wildReels]);
    }
  });
});

describe('the Scar Card', () => {
  const size = PLACEHOLDER_CONFIG.scarCard.size;

  it('takes a mark on a bail and nothing otherwise', () => {
    expect(nextScarCard(PLACEHOLDER_CONFIG, 2, false, false)).toEqual({ after: 2, filled: false });
    expect(nextScarCard(PLACEHOLDER_CONFIG, 2, true, false)).toEqual({ after: 3, filled: false });
    expect(nextScarCard(PLACEHOLDER_CONFIG, 2, true, true)).toEqual({ after: 3, filled: false });
  });

  it('fills and resets on the last mark', () => {
    expect(nextScarCard(PLACEHOLDER_CONFIG, size - 1, true, false)).toEqual({ after: 0, filled: true });
  });

  it('holds the last mark back when Flyers already start a Session', () => {
    expect(nextScarCard(PLACEHOLDER_CONFIG, size - 1, true, true)).toEqual({ after: size - 1, filled: false });
  });
});

describe('the Session', () => {
  const flyers3: SessionTrigger = { kind: 'flyers', count: 3 };
  const cap = 1_000_000;

  it('climbs a rung per landing, stays on the top rung, and ends when the spins run out', () => {
    const config = forcedLadder(true);
    const evaluator = stubEvaluator({ coinsPerGrid: 2 });
    const s = resolveSession(config, flyers3, streams(), cap, evaluator);
    const top = config.session.rungs.length - 1;
    expect(s.spins).toHaveLength(config.session.startingSpins);
    expect(s.endReason).toBe('spins-out');
    let running = 0;
    s.spins.forEach((sp, i) => {
      expect(sp.index).toBe(i);
      expect(sp.attempt.outcome).toBe('landed');
      expect(sp.attempt.bail).toBeNull();
      expect(sp.attempt.rider).toBe(s.rider);
      expect(sp.attempt.rung).toBe(sp.ladderBefore.rung);
      expect(sp.ladderAfter.rung).toBe(Math.min(i + 1, top));
      expect(sp.ladderAfter.multiplier).toBe(config.session.rungs[sp.ladderAfter.rung]!.multiplier);
      expect(sp.ladderAfter.pain).toBe(0);
      expect(sp.winCoins).toBe(2 * sp.ladderAfter.multiplier); // the multiplier the attempt just set
      running += sp.winCoins;
      expect(sp.runningTotalCoins).toBe(running);
      expect(sp.spinsLeftAfter).toBe(sp.spinsLeftBefore - 1);
      expect(sp.stops).toHaveLength(5);
      const rider = config.riders.find((r) => r.id === s.rider)!;
      expect(config.cosmetics.tricks[rider.discipline][config.session.rungs[sp.attempt.rung]!.trickTier]).toContain(
        sp.attempt.trickId,
      );
    });
    expect(s.totalWinCoins).toBe(running);
    expect(s.spins.at(-1)?.spinsLeftAfter).toBe(0);
    expect(s.closing.level).toBe('patched-up');
    expect(INJURY_CATALOGUE['patched-up']).toContain(s.closing.id);
    // Kickers are wild through the evaluator but turn no reel wild in a Session.
    for (const call of evaluator.calls) expect(call.wildReels).toEqual([]);
  });

  it('ends at pain 3 with the broken level, after adding a spin at pain 1 and 2', () => {
    const config = forcedLadder(false);
    const s = resolveSession(config, flyers3, streams(), cap, stubEvaluator());
    expect(s.endReason).toBe('pain-limit');
    expect(s.spins).toHaveLength(3);
    expect(s.spins.map((sp) => sp.ladderAfter.pain)).toEqual([1, 2, 3]);
    expect(s.spins.map((sp) => sp.attempt.bail?.injury.level)).toEqual(['scuffed', 'bleeding', 'broken']);
    expect(s.spins.map((sp) => sp.spinsAdded)).toEqual([1, 1, 0]);
    const start = config.session.startingSpins;
    expect(s.spins.map((sp) => sp.spinsLeftBefore)).toEqual([start, start, start]);
    for (const sp of s.spins) {
      const injury = sp.attempt.bail!.injury;
      expect(INJURY_CATALOGUE[injury.level]).toContain(injury.id);
      expect(sp.ladderAfter.rung).toBe(sp.ladderBefore.rung); // a bail keeps the rung
      expect(sp.ladderAfter.multiplier).toBe(sp.ladderBefore.multiplier);
    }
    expect(s.closing.level).toBe('patched-up');
  });

  it('starts higher on the ladder for more Flyers, as configured', () => {
    const config = forcedLadder(false);
    for (const [trigger, rung] of [
      [{ kind: 'flyers', count: 3 }, 0],
      [{ kind: 'flyers', count: 4 }, 1],
      [{ kind: 'flyers', count: 5 }, 2],
      [{ kind: 'scar-card' }, 0],
    ] as const) {
      const s = resolveSession(config, trigger, streams(), cap, stubEvaluator());
      expect(s.startRung).toBe(rung);
      expect(s.spins[0]?.ladderBefore).toEqual({ rung, multiplier: config.session.rungs[rung]!.multiplier, pain: 0 });
      expect(s.trigger).toEqual(trigger);
    }
  });

  it('stops at the cap and pays exactly what was left under it', () => {
    const config = forcedLadder(true);
    const s = resolveSession(config, flyers3, streams(), 1000, stubEvaluator({ coinsPerGrid: 300 }));
    expect(s.endReason).toBe('max-win');
    expect(s.totalWinCoins).toBe(1000);
    // 300 × 2 = 600, then 300 × 3 = 900 is cut to the 400 left.
    expect(s.spins.map((sp) => sp.winCoins)).toEqual([600, 400]);
    expect(s.spins.at(-1)?.runningTotalCoins).toBe(1000);
  });

  it('plays no spins when the base win already reached the cap', () => {
    const s = resolveSession(PLACEHOLDER_CONFIG, flyers3, streams(), 0, stubEvaluator());
    expect(s.spins).toEqual([]);
    expect(s.endReason).toBe('max-win');
    expect(s.totalWinCoins).toBe(0);
    expect(s.closing.level).toBe('patched-up');
  });

  it('is bounded: never more than the starting spins plus two', () => {
    const config = forcedLadder(false, (c) => {
      c.session.rungs[0].odds = { land: 1, bail: 1 };
    });
    for (let i = 0; i < 300; i++) {
      const s = resolveSession(config, flyers3, streams(i), cap, stubEvaluator());
      expect(s.spins.length).toBeLessThanOrEqual(config.session.startingSpins + 2 * config.session.extraSpinsPerBail);
      for (const sp of s.spins) {
        if (sp.attempt.bail?.injury.level === 'broken') expect(sp.ladderAfter.pain).toBe(3);
      }
    }
  });
});
