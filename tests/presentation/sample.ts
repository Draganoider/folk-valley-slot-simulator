import { FOLK_VALLEY_CONFIG, initialPlayerState, spin, type SpinResult } from '../../src/engine';
import type { GoreSetting, TimelineEventKind } from '../../src/presentation';

export const SAMPLE_SEED = '00000000000000a1';

/**
 * `count` paid spins of the shipped configuration in a row at bet level 2 (so credits differ
 * from coins), carrying the Scar Card, so the sample has landings, bails, card fills and
 * Sessions with every injury level. The first test checks the sample covers them all.
 */
export function sampleResults(count: number, masterSeed = SAMPLE_SEED): SpinResult[] {
  let state = initialPlayerState(FOLK_VALLEY_CONFIG);
  const results: SpinResult[] = [];
  for (let i = 0; i < count; i++) {
    const outcome = spin(FOLK_VALLEY_CONFIG, state, { masterSeed, spinIndex: i, betLevel: 2 });
    state = outcome.state;
    results.push(outcome.result);
  }
  return results;
}

/**
 * A small fixed set from {@link sampleResults}, chosen to cover every outcome while keeping
 * the property tests fast: the first `perKind` Sessions of each trigger (with their landings,
 * bails at every pain level and both usual endings), the first `perKind` base landings and
 * base bails (card marks and fills among them), and a few plain spins. The coverage test in
 * timeline.test.ts fails if a change to the engine or the seed leaves a gap.
 */
export function propertySample(perKind = 20, from: readonly SpinResult[] = sampleResults(20_000)): SpinResult[] {
  const picked = new Set<SpinResult>();
  const take = (p: (r: SpinResult) => boolean, n: number) => {
    let k = 0;
    for (const r of from) {
      if (k >= n) break;
      if (p(r)) {
        picked.add(r);
        k++;
      }
    }
  };
  take((r) => r.session?.trigger.kind === 'flyers', perKind);
  take((r) => r.session?.trigger.kind === 'scar-card', perKind);
  take((r) => r.session === null && r.base.attempt?.outcome === 'landed', perKind * 2);
  take((r) => r.session === null && r.base.attempt?.outcome === 'bailed', perKind * 2);
  take((r) => r.base.attempt === null && r.session === null, perKind);
  return from.filter((r) => picked.has(r));
}

/**
 * The event kinds a result implies, in order, written out from the README's contract
 * independently of `buildTimeline`, so the two check each other.
 */
export function expectedKinds(r: SpinResult, gore: GoreSetting = 'full'): TimelineEventKind[] {
  const out: TimelineEventKind[] = [];
  const reels = () => {
    out.push('reels-spin-up');
    for (let i = 0; i < r.base.stops.length; i++) out.push('reel-stop');
  };
  const bail = (level: string) => {
    out.push('bail-impact');
    if (!(gore === 'mild' && level === 'broken')) out.push('injury');
    out.push('patch-up');
  };
  const wins = (n: number, coins: number) => {
    for (let i = 0; i < n; i++) out.push('win-highlight');
    if (coins > 0) out.push('spin-win');
  };

  reels();
  const a = r.base.attempt;
  if (a !== null) {
    out.push('trick-approach', 'trick');
    if (a.outcome === 'landed') out.push('trick-land', 'wild-reels');
    else bail(a.bail!.injury.level);
  }
  wins(r.base.wins.length, r.base.winCoins);
  if (a?.outcome === 'bailed') out.push('scar-card');
  if (r.session !== null) {
    out.push('session-trigger', 'session-intro');
    for (const s of r.session.spins) {
      out.push('free-spin');
      reels();
      out.push('trick-approach', 'trick');
      if (s.attempt.outcome === 'landed') out.push('trick-land', 'ladder-climb');
      else {
        bail(s.attempt.bail!.injury.level);
        out.push('pain');
      }
      wins(s.wins.length, s.winCoins);
    }
    out.push('session-end', 'closing-card', 'session-total');
  }
  out.push('count-up');
  return out;
}
