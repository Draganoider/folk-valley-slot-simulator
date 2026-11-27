import { describe, expect, it } from 'vitest';
import { FOLK_VALLEY_CONFIG, formatSeed, initialPlayerState, seedFromText, spin, withScarCardMarks } from '../../src/engine';
import {
  GAME_STORAGE_KEY,
  STARTING_BALANCE,
  loadGame,
  newGame,
  parseSavedGame,
  playSpin,
  resetCredits,
  saveGame,
  seedFromInput,
  spinCost,
  withBetLevel,
  withSeed,
} from '../../src/ui/game/game';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../../src/ui/game/prefs';
import { describeInjury, withArticle } from '../../src/ui/game/describe';
import type { KeyValueStore } from '../../src/ui/game/storage';

const CONFIG = FOLK_VALLEY_CONFIG;
const SEED = '0123456789abcdef';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('playSpin', () => {
  it('pays exactly what the engine decided and advances the spin index', () => {
    let game = newGame(CONFIG, SEED);
    let player = initialPlayerState(CONFIG);
    for (let i = 0; i < 200; i++) {
      const paid = playSpin(CONFIG, game);
      if (!paid.ok) throw new Error('ran out of credits');
      const engine = spin(CONFIG, player, { masterSeed: SEED, spinIndex: i, betLevel: game.betLevel });
      expect(paid.result).toEqual(engine.result);
      expect(paid.game.player).toEqual(engine.state);
      expect(paid.game.balance).toBe(game.balance - spinCost(CONFIG, game.betLevel) + engine.result.totalWinCoins * game.betLevel);
      expect(paid.game.spinIndex).toBe(i + 1);
      game = paid.game;
      player = engine.state;
    }
  });

  it('refuses a spin the balance cannot cover, and reset refills it', () => {
    const broke = { ...newGame(CONFIG, SEED), balance: spinCost(CONFIG, 1) - 1 };
    expect(playSpin(CONFIG, broke)).toEqual({ ok: false, reason: 'not-enough-credits' });
    expect(resetCredits(broke).balance).toBe(STARTING_BALANCE);
  });

  it('keeps the bet level to the configured ones', () => {
    const game = newGame(CONFIG, SEED);
    expect(withBetLevel(CONFIG, game, 5).betLevel).toBe(5);
    expect(withBetLevel(CONFIG, game, 3)).toBe(game);
  });

  it('starts a new seed from spin 0 and keeps the cards', () => {
    const game = { ...newGame(CONFIG, SEED), spinIndex: 9, player: withScarCardMarks(initialPlayerState(CONFIG), 1, 4) };
    const next = withSeed(game, 'fedcba9876543210');
    expect(next.spinIndex).toBe(0);
    expect(next.player).toEqual(game.player);
  });
});

describe('seedFromInput', () => {
  it('takes 16 hex digits as they are and hashes any other text', () => {
    expect(seedFromInput(' 0123456789ABCDEF ')).toBe('0123456789abcdef');
    expect(seedFromInput('my run')).toBe(formatSeed(seedFromText('my run')));
    expect(seedFromInput('   ')).toBeNull();
  });
});

describe('saved game', () => {
  it('round-trips through storage', () => {
    const store = memoryStore();
    const game = { ...newGame(CONFIG, SEED), balance: 1234, betLevel: 5, spinIndex: 7, player: withScarCardMarks(initialPlayerState(CONFIG), 5, 3) };
    expect(saveGame(store, game)).toBe(true);
    expect(loadGame(store, CONFIG)).toEqual(game);
  });

  it('refuses a record that does not fit the configuration', () => {
    const good = JSON.parse(JSON.stringify(newGame(CONFIG, SEED))) as Record<string, unknown>;
    expect(parseSavedGame(CONFIG, good)).not.toBeNull();
    expect(parseSavedGame(CONFIG, { ...good, configId: 'other' })).toBeNull();
    expect(parseSavedGame(CONFIG, { ...good, balance: -1 })).toBeNull();
    expect(parseSavedGame(CONFIG, { ...good, balance: 1.5 })).toBeNull();
    expect(parseSavedGame(CONFIG, { ...good, betLevel: 3 })).toBeNull();
    expect(parseSavedGame(CONFIG, { ...good, masterSeed: 'xyz' })).toBeNull();
    expect(parseSavedGame(CONFIG, { ...good, player: { scarCards: { '1': CONFIG.scarCard.size } } })).toBeNull();
    expect(parseSavedGame(CONFIG, 'nonsense')).toBeNull();
  });

  it('works with storage that throws or is missing', () => {
    const game = newGame(CONFIG, SEED);
    expect(saveGame(throwingStore, game)).toBe(false);
    expect(loadGame(throwingStore, CONFIG)).toBeNull();
    expect(saveGame(null, game)).toBe(false);
    expect(loadGame(null, CONFIG)).toBeNull();
  });

  it('ignores a corrupt record', () => {
    const store = memoryStore();
    store.data.set(GAME_STORAGE_KEY, '{not json');
    expect(loadGame(store, CONFIG)).toBeNull();
  });
});

describe('preferences', () => {
  it('default to Full gore and persist Mild', () => {
    const store = memoryStore();
    expect(loadPreferences(store)).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.gore).toBe('full');
    savePreferences(store, { ...DEFAULT_PREFERENCES, gore: 'mild' });
    expect(loadPreferences(store).gore).toBe('mild');
    expect(loadPreferences(throwingStore)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('describe', () => {
  it('shows the broken level only on Full gore', () => {
    expect(describeInjury('broken', 'open-fracture-shin', 'full')).toBe('broken: open fracture shin');
    expect(describeInjury('broken', 'open-fracture-shin', 'mild')).not.toMatch(/fracture|broken/);
    expect(describeInjury('bleeding', 'nosebleed', 'mild')).not.toMatch(/bleed/);
  });

  it('picks the article', () => {
    expect(withArticle('easy manual')).toBe('an easy manual');
    expect(withArticle('hard tailwhip')).toBe('a hard tailwhip');
  });
});
