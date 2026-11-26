import type { GameConfig, ReelStrip } from './config';
import { INJURY_CATALOGUE } from './injuries';

/**
 * The shipped configuration, tuned to DR-006 by the analyser (DR-013).
 *
 * Every figure below is the analyser's, theoretical, over the Scar Card's stationary
 * distribution; none comes from a simulation (docs/findings.md has the full report and the
 * simulated runs that check it):
 *
 * - RTP 95.997% (DR-006: 96.0% ± 0.05 pp), the 2,500× cap included
 * - split: base game 55.5, trick uplift 13.2, Session 27.3 percentage points
 * - σ 5.72× bet per paid spin; hit frequency 31.2%; win above bet 17.2%
 * - a trick attempt 1 in 9.5 paid spins; a Session 1 in 141
 *
 * Only the numbers differ from the placeholder: the same symbols, rules and decision records.
 * The strips were laid out once from per-reel symbol counts by a seeded shuffle that keeps a
 * symbol from repeating within three stops, then frozen here; change them only by retuning,
 * with the analyser and a findings entry (AGENTS.md: a change to the math comes with a run).
 */

const CODES: { readonly [code: string]: string } = {
  GR: 'gramps',
  KE: 'kerb',
  ZI: 'zip',
  DO: 'dot',
  HE: 'helmet',
  DE: 'deck',
  PE: 'pegs',
  BA: 'bars',
  BO: 'bolt',
  WR: 'wrench',
  GT: 'grip-tape',
  CO: 'cone',
  ST: 'sticker',
  KI: 'kicker',
  FL: 'flyer',
};

/** A strip from two-letter codes, so the strips below stay readable. */
function strip(codes: string): ReelStrip {
  return codes
    .trim()
    .split(/\s+/)
    .map((code) => {
      const id = CODES[code];
      if (id === undefined) throw new Error(`Unknown symbol code "${code}" in the Folk Valley strips.`);
      return id;
    });
}

/** Base strips: 52, 83, 82, 83 and 52 stops. One Kicker on each of reels 2–4; 7 Flyers. */
const BASE_REELS: readonly ReelStrip[] = [
  strip(`
    BO CO KE WR ST GT WR BO CO ST DO BA GT WR DE BO ST WR GT PE
    CO BO GT ST BO GT PE CO WR ZI BO GT HE ST PE BA ZI DE CO GR
    WR DE ST BO WR DO CO KE BA HE GT FL
  `),
  strip(`
    PE BO GT BA WR GT BO BA CO WR DE ST GT BO ST PE BO CO WR GT
    BA ST WR BO GT ST BA WR GT ZI DE BO DO CO BO DE HE WR GT CO
    KE BO ST GT PE CO KI GR CO WR ST BO DO ST GT FL KE ST ZI WR
    BO CO ZI DE HE GT BO GR CO KE WR PE ST HE WR DO GT DE BA PE
    CO WR FL
  `),
  strip(`
    WR HE ST GT WR FL CO WR KE GT BA BO GT WR CO PE GT BO PE GT
    ST BO DE WR GT PE ST GR CO BA GT ST CO DE BO GT CO ST BO CO
    GT BO PE CO ST WR BO BA ZI ST WR BO DE WR ZI DE HE GR DO BO
    KE WR CO KI GT ST DO WR BO BA GT BO BA HE ST WR CO DO DE KE
    ZI PE
  `),
  strip(`
    BO HE PE GT WR BO GT CO FL GT WR DE ST GT WR BO CO GT WR CO
    GT KE CO BA BO GT ST ZI WR BA CO DE BO WR DO BO DE ST BO DE
    BA PE ST CO DO GT ST BO CO WR PE GR CO BO WR GT BO WR ST DE
    FL GT DO HE BA WR ZI ST KE WR PE KE ST GT KI GR BO CO PE ZI
    HE ST BA
  `),
  strip(`
    CO WR PE BO CO DE ST GT CO WR GT PE BA GT DE ST WR BO PE KE
    GT ST ZI CO WR BO CO ST DO BO GT WR HE ST BA BO GT FL WR BO
    HE KE CO WR GR BO DO GT DE ZI BA ST
  `),
];

/** Session strips: 51, 53, 53, 53 and 51 stops. Richer in rider and gear symbols, two Kickers on each of reels 2–4, no Flyers. */
const SESSION_REELS: readonly ReelStrip[] = [
  strip(`
    HE GT WR BO CO ST BO GT ST BO WR CO PE DO CO WR ZI ST GR GT
    PE BA GT WR ST BA ZI DE ST HE BO PE WR CO KE DE BO GT WR BO
    KE BA ST GR CO DO DE HE CO GT DO
  `),
  strip(`
    HE BO BA GT CO BO HE WR GT DE DO WR CO ST GT WR KI CO GT PE
    ST DO CO BO BA ST GR BO CO KE GR HE ST PE ZI BO PE ST BO DO
    GT WR KI CO WR GT KE DE WR BA DE ST ZI
  `),
  strip(`
    CO WR GT CO WR GT BO KI ST CO WR ZI DE BO BA ST HE GT PE WR
    CO GT ST BO DO GT PE BO DO CO BA ST ZI KI DE BA DO HE GR KE
    WR BO ST CO WR GR KE PE DE GT ST HE BO
  `),
  strip(`
    KE HE ST WR BO GT ST KE CO BO WR DE CO GT DO ST BO WR GT CO
    HE GT WR BA CO ZI DE CO DO GR PE GT KI PE BO ST BA HE ZI ST
    WR DO BO DE GT BA BO CO KI GR PE WR ST
  `),
  strip(`
    WR BO DO CO WR BO GT WR HE BA ST DE CO BO ST GT DO CO HE WR
    PE GT ST KE ZI DE HE PE ST DE BO CO BA GR GT WR ZI GT CO KE
    BO ST GR DO CO WR GT PE BA BO ST
  `),
];

export const FOLK_VALLEY_CONFIG: GameConfig = {
  id: 'folk-valley-96-v1',
  grid: { reels: 5, rows: 3 },
  bet: { coinsPerSpin: 20, levels: [1, 2, 5, 10, 25] },
  symbols: [
    { id: 'gramps', kind: 'rider' },
    { id: 'kerb', kind: 'rider' },
    { id: 'zip', kind: 'rider' },
    { id: 'dot', kind: 'rider' },
    { id: 'helmet', kind: 'gear' },
    { id: 'deck', kind: 'gear' },
    { id: 'pegs', kind: 'gear' },
    { id: 'bars', kind: 'gear' },
    { id: 'bolt', kind: 'low' },
    { id: 'wrench', kind: 'low' },
    { id: 'grip-tape', kind: 'low' },
    { id: 'cone', kind: 'low' },
    { id: 'sticker', kind: 'low' },
    { id: 'kicker', kind: 'wild' },
    { id: 'flyer', kind: 'scatter' },
  ],
  paytable: {
    gramps: { 3: 120, 4: 300, 5: 900 },
    kerb: { 3: 90, 4: 230, 5: 700 },
    zip: { 3: 90, 4: 220, 5: 600 },
    dot: { 3: 70, 4: 170, 5: 450 },
    helmet: { 3: 45, 4: 110, 5: 300 },
    deck: { 3: 45, 4: 90, 5: 230 },
    pegs: { 3: 35, 4: 70, 5: 170 },
    bars: { 3: 35, 4: 70, 5: 170 },
    bolt: { 3: 12, 4: 35, 5: 90 },
    wrench: { 3: 12, 4: 35, 5: 90 },
    'grip-tape': { 3: 12, 4: 25, 5: 70 },
    cone: { 3: 12, 4: 25, 5: 70 },
    sticker: { 3: 11, 4: 24, 5: 60 },
  },
  reels: BASE_REELS,
  riders: [
    { id: 'gramps', discipline: 'bmx', weight: 1 },
    { id: 'kerb', discipline: 'skate', weight: 1 },
    { id: 'zip', discipline: 'scooter', weight: 1 },
    { id: 'dot', discipline: 'flatland', weight: 1 },
  ],
  trickTiers: [
    { id: 'easy', weight: 6, odds: { land: 36, bail: 64 }, landing: { extraWildReels: 0, winMultiplier: 1 } },
    { id: 'medium', weight: 3, odds: { land: 26, bail: 74 }, landing: { extraWildReels: 0, winMultiplier: 2 } },
    { id: 'hard', weight: 1, odds: { land: 6, bail: 94 }, landing: { extraWildReels: 1, winMultiplier: 1 } },
  ],
  scarCard: { size: 14, persistence: 'per-bet-level' },
  session: {
    startingSpins: 12,
    startRung: { flyers3: 0, flyers4: 1, flyers5: 2, scarCard: 0 },
    rungs: [
      { multiplier: 1, odds: { land: 739, bail: 261 }, trickTier: 'easy' },
      { multiplier: 2, odds: { land: 713, bail: 287 }, trickTier: 'easy' },
      { multiplier: 3, odds: { land: 683, bail: 317 }, trickTier: 'medium' },
      { multiplier: 4, odds: { land: 653, bail: 347 }, trickTier: 'medium' },
      { multiplier: 6, odds: { land: 623, bail: 377 }, trickTier: 'hard' },
      { multiplier: 8, odds: { land: 593, bail: 407 }, trickTier: 'hard' },
    ],
    painLimit: 3,
    extraSpinsPerBail: 1,
    reels: SESSION_REELS,
  },
  injuries: {
    baseBail: 'scuffed',
    sessionPain: ['scuffed', 'bleeding', 'broken'],
    closing: 'patched-up',
  },
  cosmetics: {
    tricks: {
      bmx: {
        easy: ['bunny-hop', 'manual'],
        medium: ['tailwhip', 'barspin'],
        hard: ['backflip', 'flair'],
      },
      skate: {
        easy: ['ollie', 'pop-shove-it'],
        medium: ['kickflip', 'heelflip'],
        hard: ['360-flip', 'hardflip'],
      },
      scooter: {
        easy: ['bunny-hop', 'tailtap'],
        medium: ['tailwhip', 'barspin'],
        hard: ['double-whip', 'backflip'],
      },
      flatland: {
        easy: ['endo', 'manual-spin'],
        medium: ['pinky-squeak', 'steamroller'],
        hard: ['cliffhanger', 'boomerang'],
      },
    },
    bailAnimations: {
      bmx: ['over-the-bars', 'slide-out'],
      skate: ['board-shoots-out', 'slam-on-the-ledge'],
      scooter: ['deck-slip', 'nose-dive'],
      flatland: ['tangled-up', 'pedal-slip'],
    },
    injuries: INJURY_CATALOGUE,
  },
  maxWinMultiplier: 2500,
};
