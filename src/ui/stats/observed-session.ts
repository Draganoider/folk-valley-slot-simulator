import { addSpin, emptyStats, type SimulationStats, type SpinResult } from '../../engine';

/**
 * The player's own spins since the page opened, as the engine's mergeable statistics
 * (`src/engine/stats.ts`), plus the credits bet and won. Every figure from it is observed
 * (AGENTS.md rule 6); nothing theoretical is stored here.
 *
 * The statistics count coins, and a paid spin costs the same number of coins at every bet
 * level (DR-011), so changing the bet keeps one session. A new seed starts its spins again
 * from spin 1, and the statistics take one seed's spins in order, so a new seed (or the same
 * seed entered again) starts a new observed session; `restarted` says so on the page.
 * Kept in memory only: a reload starts a new session.
 */
export interface ObservedSession {
  readonly stats: SimulationStats;
  readonly creditsBet: number;
  readonly creditsWon: number;
  /** Why the last restart happened, or null if this is the first session since the page opened. */
  readonly restarted: 'new-seed' | null;
}

export const EMPTY_SESSION: ObservedSession = { stats: emptyStats(), creditsBet: 0, creditsWon: 0, restarted: null };

/**
 * The session with one finished spin added. The same spin given twice is counted once, so a
 * re-render that passes it again changes nothing. A spin from another seed, or from earlier
 * in the same seed, starts a new session with it.
 */
export function recordSpin(session: ObservedSession, result: SpinResult): ObservedSession {
  const s = session.stats;
  if (s.spins > 0 && s.masterSeed === result.masterSeed && s.lastSpinIndex === result.spinIndex) return session;
  const continues =
    s.spins === 0 ||
    (s.masterSeed === result.masterSeed &&
      s.configId === result.configId &&
      s.costCoins === result.costCoins &&
      (s.lastSpinIndex as number) < result.spinIndex);
  const base = continues ? session : { ...EMPTY_SESSION, restarted: 'new-seed' as const };
  return {
    stats: addSpin(base.stats, result),
    creditsBet: base.creditsBet + result.costCoins * result.betLevel,
    creditsWon: base.creditsWon + result.totalWinCoins * result.betLevel,
    restarted: base.restarted,
  };
}
