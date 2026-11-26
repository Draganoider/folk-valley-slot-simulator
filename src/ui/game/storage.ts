/**
 * Browser storage, made safe to touch.
 *
 * `localStorage` can be missing, blocked by privacy settings, throw on read in a sandboxed
 * frame, or throw on write when full. The game must still play in every one of those cases,
 * so every access goes through here and every failure becomes "nothing saved" rather than an
 * exception. The type is the three methods we use, so the game logic and its tests need no
 * DOM library.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The page's `localStorage`, or null when reading the property itself throws or it is absent. */
export function browserStore(): KeyValueStore | null {
  try {
    const store = (globalThis as { localStorage?: KeyValueStore }).localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

/** The parsed JSON at `key`, or null when there is none, it is not JSON, or storage throws. */
export function readJson(store: KeyValueStore | null, key: string): unknown {
  if (store === null) return null;
  try {
    const text = store.getItem(key);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** Saves `value` as JSON; false when storage is unavailable or refuses the write. */
export function writeJson(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (store === null) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(store: KeyValueStore | null, key: string): boolean {
  if (store === null) return false;
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
