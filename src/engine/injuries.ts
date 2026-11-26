import type { InjuryLevel } from './config';

/**
 * Every injury id the game may show, by level. This list is the text that is reviewed
 * against AGENTS.md rule 8 and DR-009 before any art exists; configuration may only use ids
 * from it, and `validateConfig` rejects any other id or any id at the wrong level.
 *
 * - Limbs bent at a wrong angle and open fractures with visible bone appear only at
 *   `broken`, the top level, which only the bail that brings Session pain to 3 reaches.
 * - Out at every level: gore beyond a fracture (organs, deep gashes, flaps of skin), blood
 *   pools or spray, dismemberment, unconscious-looking riders, and death or permanent
 *   injury played for laughs.
 * - Every bail ends `patched-up`: the rider okay, with a cast, sling or bandage.
 *
 * Adding an id here is a content decision: check it against rule 8 in review.
 */
export const INJURY_CATALOGUE: { readonly [L in InjuryLevel]: readonly string[] } = {
  scuffed: ['scrape', 'road-rash', 'bruise', 'grazed-elbow', 'scuffed-knee'],
  bleeding: ['bleeding-cut', 'nosebleed', 'split-lip', 'swollen-eye', 'knocked-out-tooth'],
  broken: [
    'wrist-bent-wrong-way',
    'forearm-bent-wrong-way',
    'ankle-bent-wrong-way',
    'open-fracture-forearm',
    'open-fracture-shin',
  ],
  'patched-up': [
    'cast-and-thumbs-up',
    'arm-in-sling',
    'neck-brace-grin',
    'bandaged-grin',
    'ice-pack-from-a-friend',
    'friend-filming-on-phone',
  ],
};
