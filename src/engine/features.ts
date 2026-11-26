import type { GameConfig } from './config';
import type { BaseTrickAttempt, Grid, SessionResult, SessionTrigger } from './result';
import type { SpinStreams } from './rng';

/**
 * The trick attempt in ordinary spins and the Session (DR-005).
 *
 * TODO(features session): implement both, with fixtures and the per-feature simulations in
 * docs/research/math-targets.md section 6.2. Outcome draws (rider, tier, land or bail, the
 * extra wild reels, the Session's stops and attempts) come from `streams.outcome`; trick
 * names, bail animations and injury ids from `streams.cosmetic` only, so adding a cosmetic
 * entry never changes an outcome. Write the draw order down in src/engine/README.md: it is
 * part of what a seed replays, and the golden full-spin test pins it.
 */

/**
 * The base-game attempt for a grid, or null when no Kicker is visible. The leftmost Kicker
 * starts it (topmost if a reel shows two). Draws the rider from `config.riders`, the tier
 * from `config.trickTiers`, then land or bail from the tier's odds; a landing turns the
 * Kicker's reel wild plus `extraWildReels` more reels drawn from the other wild-eligible
 * reels. A bail shows `config.injuries.baseBail`.
 */
export function resolveBaseTrick(
  config: GameConfig,
  grid: Grid,
  streams: SpinStreams,
): BaseTrickAttempt | null {
  void config;
  void grid;
  void streams;
  throw new Error('TODO: resolveBaseTrick is not implemented yet (milestone 2, features).');
}

/**
 * A whole Session, resolved before anything is shown. Draws one rider for the Session;
 * every free spin draws its stops from `config.session.reels`, then one attempt from the
 * current rung (land: climb a rung, or stay on the top rung; bail: pain + 1, and while pain
 * is below the limit add `extraSpinsPerBail` spins), then counts the ways win × the
 * multiplier set by that attempt. Kickers are wild but start no attempt. It ends when the
 * spins run out, when pain reaches 3, or when the paid spin's total reaches the cap, and
 * always closes with a `patched-up` card.
 *
 * @param remainingCapCoins What the paid spin may still pay before it reaches the cap,
 *   after its base win. The Session stops and pays exactly this when it gets there.
 */
export function resolveSession(
  config: GameConfig,
  trigger: SessionTrigger,
  streams: SpinStreams,
  remainingCapCoins: number,
): SessionResult {
  void config;
  void trigger;
  void streams;
  void remainingCapCoins;
  throw new Error('TODO: resolveSession is not implemented yet (milestone 2, features).');
}
