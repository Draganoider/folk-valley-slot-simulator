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
