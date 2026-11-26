import {
  DISCIPLINES,
  INJURY_LEVELS,
  RIDER_IDS,
  TRICK_TIER_IDS,
  WILD_REELS,
  type GameConfig,
  type InjuryLevel,
  type SymbolKind,
} from './config';
import { INJURY_CATALOGUE } from './injuries';

/**
 * Checks a whole configuration before the engine or the analyser uses it.
 *
 * It takes `unknown`, so a configuration read from JSON is checked as thoroughly as one
 * written in TypeScript. It reports every problem it finds, each with the path to the
 * offending value, and never clamps, defaults or rewrites anything: a configuration either
 * is exactly what the math says or is refused.
 */

export interface ValidationError {
  /** Where the problem is, such as `reels[2][14]` or `session.rungs[0].odds`. */
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly config: GameConfig; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export class ConfigError extends Error {
  readonly errors: readonly ValidationError[];
  constructor(errors: readonly ValidationError[]) {
    super(
      `Invalid game configuration:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`,
    );
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

/** The largest total weight `Rng.pickWeighted` can draw exactly. */
const MAX_TOTAL_WEIGHT = 2 ** 32;

const EXPECTED_KIND_COUNTS: { readonly [K in SymbolKind]: number } = {
  rider: 4,
  gear: 4,
  low: 5,
  wild: 1,
  scatter: 1,
};

type Obj = { readonly [key: string]: unknown };

class Checker {
  readonly errors: ValidationError[] = [];

  fail(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  object(value: unknown, path: string): Obj | undefined {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Obj;
    this.fail(path, 'must be an object');
    return undefined;
  }

  array(value: unknown, path: string): readonly unknown[] | undefined {
    if (Array.isArray(value)) return value;
    this.fail(path, 'must be an array');
    return undefined;
  }

  string(value: unknown, path: string): string | undefined {
    if (typeof value === 'string' && value.length > 0) return value;
    this.fail(path, 'must be a non-empty string');
    return undefined;
  }

  /** An integer with min ≤ value ≤ max. Floats are refused, never rounded. */
  int(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      this.fail(path, `must be an integer; got ${JSON.stringify(value)}`);
      return undefined;
    }
    if (value < min || value > max) {
      this.fail(path, `must be between ${min} and ${max}; got ${value}`);
      return undefined;
    }
    return value;
  }

  literal<T>(value: unknown, path: string, allowed: readonly T[]): T | undefined {
    if (allowed.includes(value as T)) return value as T;
    this.fail(path, `must be one of ${allowed.map((a) => JSON.stringify(a)).join(', ')}; got ${JSON.stringify(value)}`);
    return undefined;
  }

  /** A list of weights that can be drawn: integers ≥ 0 with a sum from 1 to 2^32. */
  weights(values: readonly unknown[], paths: readonly string[], groupPath: string): void {
    let total = 0;
    let allValid = true;
    values.forEach((v, i) => {
      const w = this.int(v, paths[i] ?? groupPath, 0, MAX_TOTAL_WEIGHT);
      if (w === undefined) allValid = false;
      else total += w;
    });
    if (!allValid) return;
    if (total < 1) this.fail(groupPath, 'weights must not all be zero');
    else if (total > MAX_TOTAL_WEIGHT) this.fail(groupPath, `weights must sum to at most 2^32; got ${total}`);
  }

  odds(value: unknown, path: string): void {
    const o = this.object(value, path);
    if (!o) return;
    this.weights([o['land'], o['bail']], [`${path}.land`, `${path}.bail`], path);
  }

  /** A list of distinct non-empty strings, at least one. */
  ids(value: unknown, path: string): readonly string[] | undefined {
    const list = this.array(value, path);
    if (!list) return undefined;
    if (list.length === 0) this.fail(path, 'must list at least one id');
    const seen = new Set<string>();
    const out: string[] = [];
    list.forEach((item, i) => {
      const id = this.string(item, `${path}[${i}]`);
      if (id === undefined) return;
      if (seen.has(id)) this.fail(`${path}[${i}]`, `duplicate id "${id}"`);
      seen.add(id);
      out.push(id);
    });
    return out;
  }
}

/** Validates a configuration. On success the input is returned typed, unchanged. */
export function validateConfig(input: unknown): ValidationResult {
  const c = new Checker();
  const root = c.object(input, '(config)');
  if (!root) return { ok: false, errors: c.errors };

  c.string(root['id'], 'id');

  // --- grid: 5 × 3, 243 ways
  const grid = c.object(root['grid'], 'grid');
  const rows = 3;
  if (grid) {
    c.literal(grid['reels'], 'grid.reels', [5]);
    c.literal(grid['rows'], 'grid.rows', [3]);
  }

  // --- bet
  const bet = c.object(root['bet'], 'bet');
  if (bet) {
    c.int(bet['coinsPerSpin'], 'bet.coinsPerSpin', 1);
    const levels = c.array(bet['levels'], 'bet.levels');
    if (levels) {
      if (levels.length === 0) c.fail('bet.levels', 'must list at least one bet level');
      let previous = 0;
      levels.forEach((v, i) => {
        const level = c.int(v, `bet.levels[${i}]`, 1);
        if (level === undefined) return;
        if (level <= previous) c.fail(`bet.levels[${i}]`, 'bet levels must be strictly ascending');
        previous = level;
      });
    }
  }

  // --- symbols
  const kinds = new Map<string, SymbolKind>();
  const symbols = c.array(root['symbols'], 'symbols');
  if (symbols) {
    symbols.forEach((s, i) => {
      const path = `symbols[${i}]`;
      const sym = c.object(s, path);
      if (!sym) return;
      const id = c.string(sym['id'], `${path}.id`);
      const kind = c.literal<SymbolKind>(sym['kind'], `${path}.kind`, ['rider', 'gear', 'low', 'wild', 'scatter']);
      if (id === undefined || kind === undefined) return;
      if (kinds.has(id)) c.fail(`${path}.id`, `duplicate symbol id "${id}"`);
      kinds.set(id, kind);
      if (kind === 'rider' && !(RIDER_IDS as readonly string[]).includes(id)) {
        c.fail(`${path}.id`, `a rider symbol is one of the riders ${RIDER_IDS.join(', ')}; got "${id}"`);
      }
    });
    for (const [kind, expected] of Object.entries(EXPECTED_KIND_COUNTS)) {
      const count = [...kinds.values()].filter((k) => k === kind).length;
      if (count !== expected) c.fail('symbols', `needs exactly ${expected} ${kind} symbol(s); has ${count}`);
    }
  }
  const idsOf = (kind: SymbolKind): string[] => [...kinds].filter(([, k]) => k === kind).map(([id]) => id);
  const [wildId] = idsOf('wild');
  const [scatterId] = idsOf('scatter');

  // --- paytable: every paying symbol, nothing else
  const paytable = c.object(root['paytable'], 'paytable');
  if (paytable && symbols) {
    for (const [id, kind] of kinds) {
      const paying = kind === 'rider' || kind === 'gear' || kind === 'low';
      const path = `paytable.${id}`;
      if (!paying) {
        if (id in paytable) c.fail(path, `the ${kind} symbol pays nothing by itself and has no paytable entry`);
        continue;
      }
      if (!(id in paytable)) {
        c.fail(path, 'every rider, gear and low symbol needs pays for 3, 4 and 5 of a kind');
        continue;
      }
      const pay = c.object(paytable[id], path);
      if (!pay) continue;
      const p3 = c.int(pay['3'], `${path}.3`, 0);
      const p4 = c.int(pay['4'], `${path}.4`, 0);
      const p5 = c.int(pay['5'], `${path}.5`, 0);
      if (p3 !== undefined && p4 !== undefined && p5 !== undefined) {
        if (p3 > p4 || p4 > p5) c.fail(path, 'a longer run must never pay less than a shorter one');
        if (p5 === 0) c.fail(path, 'a paying symbol must pay something for 5 of a kind');
      }
    }
    for (const id of Object.keys(paytable)) {
      if (!kinds.has(id)) c.fail(`paytable.${id}`, `"${id}" is not a symbol`);
    }
  }

  // --- reel strips, base and Session
  const checkStrips = (value: unknown, path: string): void => {
    const strips = c.array(value, path);
    if (!strips) return;
    if (strips.length !== 5) c.fail(path, `needs one strip per reel, 5; has ${strips.length}`);
    strips.forEach((s, reel) => {
      const stripPath = `${path}[${reel}]`;
      const strip = c.array(s, stripPath);
      if (!strip) return;
      if (strip.length < rows) {
        c.fail(stripPath, `a strip needs at least ${rows} stops to fill the window; has ${strip.length}`);
        return;
      }
      const flyerStops: number[] = [];
      strip.forEach((sym, stop) => {
        const symPath = `${stripPath}[${stop}]`;
        if (typeof sym !== 'string' || !kinds.has(sym)) {
          if (symbols) c.fail(symPath, `${JSON.stringify(sym)} is not a symbol`);
          return;
        }
        if (sym === wildId && !WILD_REELS.includes(reel)) {
          c.fail(symPath, `the Kicker wild may only sit on reels 2–4; this is reel ${reel + 1}`);
        }
        if (sym === scatterId) flyerStops.push(stop);
      });
      // At most one Flyer in any window of `rows` consecutive stops, wrapping round.
      for (let i = 0; i < flyerStops.length; i++) {
        const a = flyerStops[i] as number;
        const b = (flyerStops[(i + 1) % flyerStops.length] as number) + (i + 1 === flyerStops.length ? strip.length : 0);
        if (flyerStops.length > 1 && b - a < rows) {
          c.fail(stripPath, `two Session Flyers at stops ${a} and ${b % strip.length} can show in one window; keep them at least ${rows} stops apart`);
        }
      }
    });
  };
  checkStrips(root['reels'], 'reels');

  // --- riders
  const riders = c.array(root['riders'], 'riders');
  if (riders) {
    const seen = new Set<string>();
    riders.forEach((r, i) => {
      const path = `riders[${i}]`;
      const rider = c.object(r, path);
      if (!rider) return;
      const id = c.literal(rider['id'], `${path}.id`, RIDER_IDS);
      c.literal(rider['discipline'], `${path}.discipline`, DISCIPLINES);
      if (id !== undefined) {
        if (seen.has(id)) c.fail(`${path}.id`, `duplicate rider "${id}"`);
        seen.add(id);
      }
    });
    for (const id of RIDER_IDS) if (!seen.has(id)) c.fail('riders', `rider "${id}" is missing`);
    const objs = riders.map((r) => (typeof r === 'object' && r !== null ? (r as Obj) : {}));
    c.weights(objs.map((r) => r['weight']), objs.map((_, i) => `riders[${i}].weight`), 'riders');
  }

  // --- base-game trick tiers
  const tiers = c.array(root['trickTiers'], 'trickTiers');
  if (tiers) {
    if (tiers.length !== TRICK_TIER_IDS.length) {
      c.fail('trickTiers', `needs the tiers ${TRICK_TIER_IDS.join(', ')} in that order`);
    }
    const objs: Obj[] = [];
    tiers.forEach((t, i) => {
      const path = `trickTiers[${i}]`;
      const tier = c.object(t, path);
      if (!tier) return;
      objs.push(tier);
      if (tier['id'] !== TRICK_TIER_IDS[i]) {
        c.fail(`${path}.id`, `expected "${TRICK_TIER_IDS[i] ?? '(none)'}"; got ${JSON.stringify(tier['id'])}`);
      }
      c.odds(tier['odds'], `${path}.odds`);
      const landing = c.object(tier['landing'], `${path}.landing`);
      if (landing) {
        // A landing turns the Kicker's reel wild, so the other wild-eligible reels are the most it can add.
        c.int(landing['extraWildReels'], `${path}.landing.extraWildReels`, 0, WILD_REELS.length - 1);
        c.int(landing['winMultiplier'], `${path}.landing.winMultiplier`, 1);
      }
    });
    if (objs.length === tiers.length) {
      c.weights(objs.map((t) => t['weight']), objs.map((_, i) => `trickTiers[${i}].weight`), 'trickTiers');
    }
  }

  // --- Scar Card
  const scar = c.object(root['scarCard'], 'scarCard');
  if (scar) {
    c.int(scar['size'], 'scarCard.size', 1);
    c.literal(scar['persistence'], 'scarCard.persistence', ['per-bet-level']);
  }

  // --- Session
  const session = c.object(root['session'], 'session');
  if (session) {
    c.int(session['startingSpins'], 'session.startingSpins', 1);
    c.literal(session['painLimit'], 'session.painLimit', [3]);
    c.int(session['extraSpinsPerBail'], 'session.extraSpinsPerBail', 0);
    const rungs = c.array(session['rungs'], 'session.rungs');
    if (rungs) {
      if (rungs.length < 2) c.fail('session.rungs', 'a ladder needs at least 2 rungs');
      let previous = 1;
      rungs.forEach((r, i) => {
        const path = `session.rungs[${i}]`;
        const rung = c.object(r, path);
        if (!rung) return;
        const m = c.int(rung['multiplier'], `${path}.multiplier`, 1);
        if (m !== undefined) {
          if (m < previous) c.fail(`${path}.multiplier`, 'multipliers must never fall as the rungs rise');
          previous = m;
        }
        c.odds(rung['odds'], `${path}.odds`);
        c.literal(rung['trickTier'], `${path}.trickTier`, TRICK_TIER_IDS);
      });
      const start = c.object(session['startRung'], 'session.startRung');
      if (start) {
        for (const key of ['flyers3', 'flyers4', 'flyers5', 'scarCard'] as const) {
          c.int(start[key], `session.startRung.${key}`, 0, Math.max(0, rungs.length - 1));
        }
        const s3 = start['flyers3'];
        const s4 = start['flyers4'];
        const s5 = start['flyers5'];
        if (typeof s3 === 'number' && typeof s4 === 'number' && typeof s5 === 'number' && (s3 > s4 || s4 > s5)) {
          c.fail('session.startRung', 'more Flyers must never start lower on the ladder');
        }
      }
    }
    checkStrips(session['reels'], 'session.reels');
  }

  // --- injuries (DR-009): broken only at the pain limit, every sequence ends patched up
  const injuries = c.object(root['injuries'], 'injuries');
  if (injuries) {
    const level = (value: unknown, path: string): InjuryLevel | undefined => c.literal(value, path, INJURY_LEVELS);
    const base = level(injuries['baseBail'], 'injuries.baseBail');
    if (base !== undefined && base !== 'scuffed') {
      c.fail('injuries.baseBail', 'a base-game bail only ever shows "scuffed"');
    }
    const pain = c.array(injuries['sessionPain'], 'injuries.sessionPain');
    if (pain) {
      if (pain.length !== 3) c.fail('injuries.sessionPain', 'needs one level for each pain step, 1 to 3');
      let previous = 0;
      pain.forEach((v, i) => {
        const path = `injuries.sessionPain[${i}]`;
        const l = level(v, path);
        if (l === undefined) return;
        const rank = INJURY_LEVELS.indexOf(l);
        if (l === 'patched-up') c.fail(path, '"patched-up" is the closing card, not a bail');
        else if (l === 'broken' && i !== pain.length - 1) c.fail(path, '"broken" is only for the bail that reaches the pain limit');
        if (rank < previous) c.fail(path, 'injuries must never get milder as pain rises');
        previous = rank;
      });
    }
    const closing = level(injuries['closing'], 'injuries.closing');
    if (closing !== undefined && closing !== 'patched-up') {
      c.fail('injuries.closing', 'every bail sequence ends "patched-up"');
    }
  }

  // --- cosmetics
  const cosmetics = c.object(root['cosmetics'], 'cosmetics');
  if (cosmetics) {
    const tricks = c.object(cosmetics['tricks'], 'cosmetics.tricks');
    const bails = c.object(cosmetics['bailAnimations'], 'cosmetics.bailAnimations');
    for (const d of DISCIPLINES) {
      if (tricks) {
        const byTier = c.object(tricks[d], `cosmetics.tricks.${d}`);
        if (byTier) for (const t of TRICK_TIER_IDS) c.ids(byTier[t], `cosmetics.tricks.${d}.${t}`);
      }
      if (bails) c.ids(bails[d], `cosmetics.bailAnimations.${d}`);
    }
    const inj = c.object(cosmetics['injuries'], 'cosmetics.injuries');
    if (inj) {
      for (const l of INJURY_LEVELS) {
        const path = `cosmetics.injuries.${l}`;
        const list = c.ids(inj[l], path);
        list?.forEach((id, i) => {
          if (!INJURY_CATALOGUE[l].includes(id)) {
            const elsewhere = INJURY_LEVELS.find((other) => INJURY_CATALOGUE[other].includes(id));
            c.fail(
              `${path}[${i}]`,
              elsewhere
                ? `"${id}" is a "${elsewhere}" injury, not "${l}"`
                : `"${id}" is not in INJURY_CATALOGUE, the list reviewed against AGENTS.md rule 8`,
            );
          }
        });
      }
    }
  }

  c.int(root['maxWinMultiplier'], 'maxWinMultiplier', 1);

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  return { ok: true, config: input as GameConfig, errors: [] };
}

/** Validates and returns the configuration, or throws a {@link ConfigError} listing every problem. */
export function assertValidConfig(input: unknown): GameConfig {
  const result = validateConfig(input);
  if (!result.ok) throw new ConfigError(result.errors);
  return result.config;
}
