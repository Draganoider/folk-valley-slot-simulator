import { readJson, writeJson, type KeyValueStore } from './storage';

/**
 * The gore setting (DR-009). Full, the default, shows every injury level as the result
 * names it. Mild swaps the `broken` level for its patched-up card and hides blood. It is a
 * presentation choice only: the engine never sees it, so it cannot change an outcome
 * (rule 4).
 */
export type GoreSetting = 'full' | 'mild';

export interface Preferences {
  readonly gore: GoreSetting;
}

export const DEFAULT_PREFERENCES: Preferences = { gore: 'full' };

export const PREFS_STORAGE_KEY = 'folk-valley.prefs.v1';

export function parsePreferences(value: unknown): Preferences {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFERENCES;
  const gore = (value as { gore?: unknown }).gore;
  return { gore: gore === 'mild' ? 'mild' : 'full' };
}

export function loadPreferences(store: KeyValueStore | null): Preferences {
  return parsePreferences(readJson(store, PREFS_STORAGE_KEY));
}

export function savePreferences(store: KeyValueStore | null, prefs: Preferences): boolean {
  return writeJson(store, PREFS_STORAGE_KEY, prefs);
}
