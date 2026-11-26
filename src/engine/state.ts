import type { GameConfig } from './config';

/**
 * What the engine carries between paid spins: the Scar Card marks for each bet level
 * (DR-005, DR-010). Nothing else carries over, so a paid spin is a pure function of the
 * configuration, the master seed, the spin index, the bet level and this state.
 *
 * Plain data, saved in the browser beside the virtual balance.
 */
export interface PlayerState {
  /** Marks on each bet level's card, keyed by the bet level as a decimal string. */
  readonly scarCards: { readonly [betLevel: string]: number };
}

/** Every bet level's card empty. */
export function initialPlayerState(config: GameConfig): PlayerState {
  const scarCards: { [betLevel: string]: number } = {};
  for (const level of config.bet.levels) scarCards[String(level)] = 0;
  return { scarCards };
}

/** Marks on the card of `betLevel`. Throws for a bet level the configuration does not offer. */
export function scarCardMarks(config: GameConfig, state: PlayerState, betLevel: number): number {
  if (!config.bet.levels.includes(betLevel)) {
    throw new RangeError(`Bet level ${betLevel} is not one of ${config.bet.levels.join(', ')}.`);
  }
  const marks = state.scarCards[String(betLevel)] ?? 0;
  if (!Number.isInteger(marks) || marks < 0 || marks >= config.scarCard.size) {
    throw new RangeError(`The card at bet level ${betLevel} has ${marks} marks; it holds 0 to ${config.scarCard.size - 1}.`);
  }
  return marks;
}

/** A new state with the card of `betLevel` set to `marks`. The input is not changed. */
export function withScarCardMarks(state: PlayerState, betLevel: number, marks: number): PlayerState {
  return { scarCards: { ...state.scarCards, [String(betLevel)]: marks } };
}

/**
 * The Scar Card after one paid spin at its bet level (DR-005, DR-012).
 *
 * A bail adds a mark. The mark that fills the card starts a Session and resets the card to
 * 0, unless the same spin already starts a Session from Flyers: a paid spin starts at most
 * one Session, so the card then holds that last mark back and stays one short of full, and
 * the next bail fills it. Nothing else changes the card.
 *
 * @param before Marks before the spin, 0 to size − 1.
 */
export function nextScarCard(
  config: GameConfig,
  before: number,
  bailed: boolean,
  flyersTrigger: boolean,
): { readonly after: number; readonly filled: boolean } {
  if (!bailed) return { after: before, filled: false };
  const marked = before + 1;
  if (marked < config.scarCard.size) return { after: marked, filled: false };
  if (flyersTrigger) return { after: before, filled: false };
  return { after: 0, filled: true };
}
