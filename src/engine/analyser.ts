import type { GameConfig } from './config';

/**
 * The exact analyser: every theoretical figure, computed from the configuration and never
 * from a simulation (DR-006, docs/research/math-targets.md section 5).
 *
 * TODO(analyser session): exact enumeration of the base game over distinct windows, the
 * Scar Card's stationary distribution, and the Session's dynamic programme with the cap.
 * Full enumeration runs nightly and on demand (DR-010); toy configurations carry the unit
 * tests. This interface is a starting point; reshape it as the work needs.
 */

/** A theoretical figure, labelled so it is never shown as an observed one (rule 6). */
export interface Theoretical<T> {
  readonly kind: 'theoretical';
  readonly value: T;
}

export interface TheoreticalReport {
  readonly configId: string;
  /** Expected payout per paid spin ÷ its cost, under the Scar Card's stationary distribution. */
  readonly rtp: Theoretical<number>;
  readonly rtpSplit: Theoretical<{
    readonly baseWays: number;
    readonly trickLandings: number;
    readonly sessionFromFlyers: number;
    readonly sessionFromScarCard: number;
  }>;
  /** Standard deviation of one paid spin's payout, × bet. */
  readonly sigma: Theoretical<number>;
  readonly hitFrequency: Theoretical<number>;
  readonly winAboveBetFrequency: Theoretical<number>;
  readonly sessionRate: Theoretical<number>;
  readonly trickRate: Theoretical<number>;
  readonly capProbability: Theoretical<number>;
}

export function analyse(config: GameConfig): TheoreticalReport {
  void config;
  throw new Error('TODO: analyse is not implemented yet (milestone 2, analyser).');
}
