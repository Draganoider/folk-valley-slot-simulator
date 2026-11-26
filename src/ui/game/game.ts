import {
  formatSeed,
  initialPlayerState,
  seedFromText,
  spin,
  type GameConfig,
  type PlayerState,
  type SpinResult,
} from '../../engine';
import { readJson, writeJson, type KeyValueStore } from './storage';

/**
 * The player's game, kept by the app and not by the engine: the virtual balance, the chosen
 * bet, the seed and how far play has got under it, and the engine's own carry-over state,
 * the Scar Card per bet level (DR-010). Plain data, saved in the browser as one record so the
 * balance and the cards can never be saved out of step.
 *
 * Virtual credits only (AGENTS.md rule 3): the balance is a number in this record and
 * nothing else. It cannot be bought, sold or cashed out, and "reset credits" refills it.
 */
export interface GameState {
  /** The configuration this record was played under; a record from another is discarded. */
  readonly configId: string;
  /** Virtual credits. */
  readonly balance: number;
  /** Credits per coin, one of `config.bet.levels`. */
  readonly betLevel: number;
  /** Canonical 16-digit hex master seed. */
  readonly masterSeed: string;
  /** The index of the next paid spin under that seed. */
  readonly spinIndex: number;
  /** The Scar Card marks per bet level. */
  readonly player: PlayerState;
}

/** The balance a new player starts with, and what "reset credits" restores. */
export const STARTING_BALANCE = 10_000;

/** The storage key; the `v1` changes when the record's shape does. */
export const GAME_STORAGE_KEY = 'folk-valley.game.v1';

export function newGame(config: GameConfig, masterSeed: string): GameState {
  return {
    configId: config.id,
    balance: STARTING_BALANCE,
    betLevel: config.bet.levels[0] ?? 1,
    masterSeed,
    spinIndex: 0,
    player: initialPlayerState(config),
  };
}

/** What one paid spin costs at `betLevel`, in credits. */
export function spinCost(config: GameConfig, betLevel: number): number {
  return config.bet.coinsPerSpin * betLevel;
}

/** What a result paid, in credits. */
export function winCredits(result: SpinResult): number {
  return result.totalWinCoins * result.betLevel;
}

export function canAfford(config: GameConfig, game: GameState): boolean {
  return game.balance >= spinCost(config, game.betLevel);
}

export type PaidSpin =
  | { readonly ok: true; readonly game: GameState; readonly result: SpinResult }
  | { readonly ok: false; readonly reason: 'not-enough-credits' };

/**
 * One paid spin: the engine decides the whole result, Session included, before anything is
 * shown (rule 4), and the new game state already holds its cost, its win and the new card.
 * Presentation receives the result afterwards and cannot change either.
 */
export function playSpin(config: GameConfig, game: GameState): PaidSpin {
  if (!canAfford(config, game)) return { ok: false, reason: 'not-enough-credits' };
  const outcome = spin(config, game.player, {
    masterSeed: game.masterSeed,
    spinIndex: game.spinIndex,
    betLevel: game.betLevel,
  });
  return {
    ok: true,
    result: outcome.result,
    game: {
      ...game,
      balance: game.balance - spinCost(config, game.betLevel) + winCredits(outcome.result),
      spinIndex: game.spinIndex + 1,
      player: outcome.state,
    },
  };
}

/** Refills the virtual balance. The Scar Cards, the seed and the spin count are kept. */
export function resetCredits(game: GameState): GameState {
  return { ...game, balance: STARTING_BALANCE };
}

/** Switches bet level, and with it the Scar Card in play. */
export function withBetLevel(config: GameConfig, game: GameState, betLevel: number): GameState {
  if (!config.bet.levels.includes(betLevel)) return game;
  return { ...game, betLevel };
}

/** Starts play over under a new seed, from spin 0. Balance and cards are kept. */
export function withSeed(game: GameState, masterSeed: string): GameState {
  return { ...game, masterSeed, spinIndex: 0 };
}

const HEX_SEED = /^[0-9a-fA-F]{16}$/;

/**
 * The canonical seed for what the player typed: 16 hex digits are taken as they are, any
 * other text is hashed with the engine's `seedFromText`, so "my run" always means the same
 * seed. Null for blank input.
 */
export function seedFromInput(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (HEX_SEED.test(trimmed)) return trimmed.toLowerCase();
  return formatSeed(seedFromText(trimmed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Reads a saved record back, checking every field against the configuration. A record that
 * does not fit, from an older shape, another configuration, or edited by hand, is refused
 * whole rather than repaired, and the player starts fresh.
 */
export function parseSavedGame(config: GameConfig, value: unknown): GameState | null {
  if (!isRecord(value)) return null;
  const { configId, balance, betLevel, masterSeed, spinIndex, player } = value;
  if (configId !== config.id) return null;
  if (!isCount(balance) || !isCount(spinIndex)) return null;
  if (typeof betLevel !== 'number' || !config.bet.levels.includes(betLevel)) return null;
  if (typeof masterSeed !== 'string' || !/^[0-9a-f]{16}$/.test(masterSeed)) return null;
  if (!isRecord(player) || !isRecord(player.scarCards)) return null;
  const scarCards: { [level: string]: number } = {};
  for (const level of config.bet.levels) {
    const marks = player.scarCards[String(level)] ?? 0;
    if (!isCount(marks) || marks >= config.scarCard.size) return null;
    scarCards[String(level)] = marks;
  }
  return { configId, balance, betLevel, masterSeed, spinIndex, player: { scarCards } };
}

export function loadGame(store: KeyValueStore | null, config: GameConfig): GameState | null {
  return parseSavedGame(config, readJson(store, GAME_STORAGE_KEY));
}

/** False when the browser would not save it; the game carries on unsaved. */
export function saveGame(store: KeyValueStore | null, game: GameState): boolean {
  return writeJson(store, GAME_STORAGE_KEY, game);
}
