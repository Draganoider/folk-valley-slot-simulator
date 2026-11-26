import type { GameConfig, ReelStrip } from './config';
import { INJURY_CATALOGUE } from './injuries';

/**
 * The untuned placeholder configuration, kept as a test fixture only.
 *
 * THE NUMBERS ARE UNTUNED and nothing ships with them: the game uses `FOLK_VALLEY_CONFIG`
 * (folk-valley-config.ts, DR-013). The placeholder stays because the golden draw-order and
 * feature tests pin its strips, and changing them would change those pinned values without
 * testing anything new. Its theoretical RTP is 73.2% (docs/findings.md). Quote no figure
 * from it as the game's.
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
      if (id === undefined) throw new Error(`Unknown symbol code "${code}" in the placeholder strips.`);
      return id;
    });
}

const BASE_REELS: readonly ReelStrip[] = [
  strip('GR BO KE WR ZI GT DO CO HE ST DE BO PE WR BA FL GT CO BO ST WR GT KE CO ZI BO DE HE ST PE BA DO'),
  strip('KE CO GR WR KI BO ZI ST DE GT HE BO DO CO PE FL WR BA ST GT KI CO BO KE WR DE ZI GT HE ST BA PE'),
  strip('ZI ST BO GR KI WR DO CO HE GT KE BO PE ST FL WR DE CO BA GT BO KI ZI WR HE ST DO GT PE CO KE BA'),
  strip('DO WR GT KE KI CO GR BO DE ST ZI WR HE GT BA FL CO PE BO ST KI DO WR GT KE CO DE BO HE ZI ST PE'),
  strip('BO KE GT GR WR ZI CO DO ST HE BO DE WR PE GT BA FL CO ST GR BO WR KE GT ZI CO DO HE ST DE BA PE'),
];

export const PLACEHOLDER_CONFIG: GameConfig = {
  id: 'placeholder-untuned-0',
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
    gramps: { 3: 10, 4: 25, 5: 60 },
    kerb: { 3: 8, 4: 20, 5: 50 },
    zip: { 3: 8, 4: 20, 5: 50 },
    dot: { 3: 6, 4: 15, 5: 40 },
    helmet: { 3: 4, 4: 10, 5: 25 },
    deck: { 3: 4, 4: 10, 5: 25 },
    pegs: { 3: 3, 4: 8, 5: 20 },
    bars: { 3: 3, 4: 8, 5: 20 },
    bolt: { 3: 1, 4: 3, 5: 8 },
    wrench: { 3: 1, 4: 3, 5: 8 },
    'grip-tape': { 3: 1, 4: 2, 5: 6 },
    cone: { 3: 1, 4: 2, 5: 6 },
    sticker: { 3: 1, 4: 2, 5: 5 },
  },
  reels: BASE_REELS,
  riders: [
    { id: 'gramps', discipline: 'bmx', weight: 1 },
    { id: 'kerb', discipline: 'skate', weight: 1 },
    { id: 'zip', discipline: 'scooter', weight: 1 },
    { id: 'dot', discipline: 'flatland', weight: 1 },
  ],
  trickTiers: [
    { id: 'easy', weight: 6, odds: { land: 6, bail: 4 }, landing: { extraWildReels: 0, winMultiplier: 1 } },
    { id: 'medium', weight: 3, odds: { land: 4, bail: 6 }, landing: { extraWildReels: 1, winMultiplier: 1 } },
    { id: 'hard', weight: 1, odds: { land: 2, bail: 8 }, landing: { extraWildReels: 1, winMultiplier: 2 } },
  ],
  scarCard: { size: 5, persistence: 'per-bet-level' },
  session: {
    startingSpins: 8,
    startRung: { flyers3: 0, flyers4: 1, flyers5: 2, scarCard: 0 },
    rungs: [
      { multiplier: 1, odds: { land: 70, bail: 30 }, trickTier: 'easy' },
      { multiplier: 2, odds: { land: 60, bail: 40 }, trickTier: 'easy' },
      { multiplier: 3, odds: { land: 50, bail: 50 }, trickTier: 'medium' },
      { multiplier: 5, odds: { land: 40, bail: 60 }, trickTier: 'medium' },
      { multiplier: 8, odds: { land: 30, bail: 70 }, trickTier: 'hard' },
      { multiplier: 10, odds: { land: 25, bail: 75 }, trickTier: 'hard' },
    ],
    painLimit: 3,
    extraSpinsPerBail: 1,
    reels: BASE_REELS,
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
