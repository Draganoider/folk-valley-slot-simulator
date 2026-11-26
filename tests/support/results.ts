import { RESULT_FORMAT_VERSION, RNG_VERSION } from '../../src/engine';
import type { BaseTrickAttempt, SessionResult, SpinResult } from '../../src/engine';

export const SEED = '0123456789abcdef';

/** A hand-made spin result: only the fields the stats read are meaningful. */
export function makeResult(
  spinIndex: number,
  totalWinCoins: number,
  extra: {
    readonly baseWin?: number;
    readonly attempt?: BaseTrickAttempt | null;
    readonly scar?: { before: number; after: number; filled: boolean };
    readonly session?: SessionResult | null;
    readonly capped?: boolean;
    readonly cost?: number;
    readonly seed?: string;
  } = {},
): SpinResult {
  const scar = extra.scar ?? { before: 0, after: 0, filled: false };
  return {
    formatVersion: RESULT_FORMAT_VERSION,
    rngVersion: RNG_VERSION,
    configId: 'hand',
    masterSeed: extra.seed ?? SEED,
    spinIndex,
    betLevel: 1,
    costCoins: extra.cost ?? 20,
    base: {
      stops: [0, 0, 0, 0, 0],
      grid: [],
      attempt: extra.attempt ?? null,
      flyers: { count: 0, positions: [] },
      wins: [],
      winCoins: extra.baseWin ?? totalWinCoins,
    },
    scarCard: { betLevel: 1, size: 5, ...scar },
    session: extra.session ?? null,
    totalWinCoins,
    capped: extra.capped ?? false,
  };
}

export function attempt(tier: BaseTrickAttempt['tier'], outcome: 'landed' | 'bailed'): BaseTrickAttempt {
  return {
    rider: 'zip',
    tier,
    kicker: { reel: 1, row: 0 },
    trickId: 't',
    outcome,
    wildReels: outcome === 'landed' ? [1] : [],
    winMultiplier: outcome === 'landed' ? 2 : 1,
    bail: outcome === 'bailed' ? { animationId: 'a', injury: { level: 'scuffed', id: 'scrape' } } : null,
  };
}
