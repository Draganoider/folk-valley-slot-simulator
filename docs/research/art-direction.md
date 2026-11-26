# Research: art direction and asset pipeline

Milestone 1 research input for the art-direction decision record. Status: **proposal**, not
yet accepted. It covers the look, the rider cast, the symbols, how injuries are drawn, how
images are prompted and generated, and how an original becomes a shipped file.

It was written alongside three sibling research pages, `docs/research/mechanics.md`,
`docs/research/math-targets.md` and `docs/research/rendering.md`, and borrows their working
assumptions. It uses the mechanics page's symbol set and rider names, its three injury tiers
and its rule that a patch-up follows every bail. It takes PixiJS cut-out rigs and WebP atlases
of at most 2048 × 2048 from the rendering page. Where those pages change, this one follows.

Binding rules: [`AGENTS.md`](../../AGENTS.md) rules 7 (original assets, provenance) and 8
(injuries), and DR-001 (compressed web files, at most 1 MB each) and DR-003 (injuries) in
[`PLAN.md`](../PLAN.md).

## Summary

| Question | Proposal |
|---|---|
| Style | **Stylized-realistic painted**: realistic anatomy, materials and light, finished as a digital painting rather than a photograph |
| Light and palette | Golden hour for the base game, floodlit dusk for the bonus Session; warm concrete and pine with sunset-orange accents (palette below) |
| Setting | **Folk Valley**, an original DIY concrete park on the floor of a pine-forested river valley |
| UI frame | Built from park materials (plywood ramp deck, steel coping, grip tape, painted concrete), drawn mostly in CSS and SVG with a few tileable textures; no text baked into images |
| Cast | Four original adults, one per discipline plus a veteran: **Gramps** (veteran BMX), **Kerb** (street skate), **Zip** (scooter), **Dot** (flatland BMX) |
| Injuries | Three tiers from rule 8, shown as swappable decals and parts on the rig; tier 3 appears only in the patch-up |
| Generation | OpenAI image generation through the Codex CLI (`codex-image` skill), a fixed style block, a reference sheet per rider, and edits for variants |
| Consistency | A master turnaround sheet per rider, attached to every later prompt for that rider; rigs reuse the same pixels, so animation never drifts |
| Pipeline | `art-source/` PNG originals → scripted clean-up (alpha clamp, trim, resize, atlas) → WebP in `src/assets/` → an entry in `src/assets/provenance.json` |
| Trial | Seven images, **no refusals**, including the strongest injuries rule 8 allows. Style drifts towards photographic without a reference image, and the generator's alpha channel needs cleaning before use |

## 1. Visual style

### Realistic or stylized-realistic

| | Photoreal | Stylized-realistic painted (proposed) | Stylized / cartoon |
|---|---|---|---|
| Matches "fairly realistic" | Yes | Yes: real anatomy, cloth, concrete and light | No (DR-003 already rejected cartoon-only) |
| Injuries | A photographic nosebleed reads as a real-life injury. Being clearly fictional helps the joke | Reads as real, but it is visibly a painting, so it lands as a wince rather than a medical photo | Too soft for the brief |
| Consistency across ~hundreds of images | Hard: small face changes are obvious in photos | Easier: painterly simplification hides small drift | Easiest |
| Cut-out rig seams | Very visible: paper-doll joints look wrong against photo textures | Acceptable: painted edges and joint caps blend | Invisible |
| "No real people" risk | Highest: a photoreal generated face can look like a real person | Low | Lowest |
| Small-size readability (symbols at ~128 px) | Weak: busy detail | Good with simplified surfaces and a strong silhouette | Best |

**Proposal: stylized-realistic painted**, like painted key art for a game: correct
proportions and materials, slightly simplified surfaces, visible but controlled brushwork,
clean silhouettes and a warm rim light. It keeps the realism the owner asked for and makes
consistency and rigging achievable with a generator. Being visibly fictional also keeps the
injuries on the right side of rule 8. The trial (section 9) showed that the model drifts
towards photographic finish unless a painted reference image is attached, so the reference
is part of the style, not an optional extra.

### Palette

Colour is never the only signal; every state also has a shape, label or position, so the
game reads the same for colour-blind players.

| Role | Name | Hex | Use |
|---|---|---|---|
| Ground | Sun-baked concrete | `#C9B79C` | Park surfaces, neutral UI panels |
| Shadow | Dusk teal | `#2F5D62` | Cool shadows, UI background, Zip's accent |
| Nature | Valley pine | `#3E5B3A` | Trees, hills, secondary UI |
| Accent | Sunset orange | `#E8763A` | Primary action (spin), wins, Gramps's accent |
| Accent 2 | Ramp mustard | `#D9A63A` | Highlights, medium wins, Kerb's accent |
| Cloth | Worn denim | `#3B5878` | Clothing, Dot's secondary |
| Injury | Bruise plum | `#6B3F5E` | Bruises, the Scar Card, Dot's accent; bail states in UI |
| Patch-up | Bandage white | `#F2EDE4` | Bandages, casts, light text |
| Dark | Asphalt | `#1F2326` | Text, reel window, deep shadow |
| Blood | Graze red | `#A3322B` | Only inside injury art, small areas; never a UI colour |

Proportions: roughly 70% warm neutrals (concrete, pine, sky), 20% cool shadow, 10% accent.
Red is never a UI colour: in a game about bails, a red UI would read as "blood" or "loss".

### Lighting

- **Base game: late-afternoon golden hour.** Key light from the upper left, warm highlights,
  blue-violet shadows, long soft cast shadows. Every asset is lit from the upper left so cut
  parts and symbols composite without contradicting each other.
- **The Session (bonus): floodlit dusk.** Sky deep teal to plum, park floodlights and a string
  of warm bulbs, harder shadows. A lighting change, not a new location, tells the player the
  game state changed. Same light direction for the key light.
- Symbols and rig parts use a **neutral version**: soft warm key from the upper left, no cast
  shadow, no strong environment colour, so they sit in either lighting state. Shadows and
  grading are added in the renderer.

### The setting: Folk Valley park

An original DIY concrete skatepark built by locals on the flat floor of a pine-forested river
valley: hand-poured bowl, quarter pipe, a long grind ledge with worn edges, a rusty rail, a
dirt-jump line with plywood lips, a chain-link fence with a hand-painted plywood board
(abstract shapes only), folding camp chairs and a cooler, a river, low wooden houses and a
water tower in the distance. It is not modelled on any real park or town.

Composition rule for the scene plate: **the central 60% stays calm and low-contrast**, because
the 5 × 3 reels sit on top of it. Interest goes to the left and right edges, the sky and the
hills. The trial's scene plate followed this on the first try (section 9).

Rider action happens on a strip of the scene beside or above the reels; which side is
settled by the layout work in milestone 3.

### UI frame look

The frame is made of the park itself:

- **Reel window:** a recessed panel of painted concrete, framed by a plywood ramp deck with a
  round steel coping along the top edge and visible bolts at the corners.
- **Spin button:** a big round sunset-orange button with a grip-tape texture ring; the
  pressed state sinks into the deck.
- **Scar Card** (the mechanics page's bail meter): a battered clipboard card with tick boxes
  that fill with plasters as bails are marked.
- **Session Flyer and bonus banners:** hand-cut paper on plywood, held by tape.
- **Statistics panel:** a plain, readable panel. It borrows colours, not textures, because it
  is the teaching part of the product and must be legible (rule 6). Simulated and
  theoretical figures are labelled as such in text.
- **Balance:** always reads "credits" and never shows a currency symbol (rule 3).

All text is live DOM or vector text, never baked into images. That keeps it accessible,
translatable and editable, and the image model's lettering is unreliable anyway. Shapes are
CSS or SVG; only materials (plywood, grip tape, concrete, coping steel) are small tileable
WebP textures.

## 2. The rider cast

Four original adults, named after the mechanics page. **None is based on a real rider, and
no gear carries a real brand.** Every rider wears a helmet. It fits the "patched up and okay"
tone, and it keeps head impacts off the table, so no bail ever implies a serious head
injury. Each rider owns one accent colour and one silhouette feature, so they read at
symbol size and in motion.

| Rider | Discipline, role | Visual brief | Accent | Silhouette hook |
|---|---|---|---|---|
| **Gramps** | Veteran BMX, the top symbol | A man in his mid-50s, weathered tan skin, short grey beard, crow's feet from grinning. Retro open-face helmet with old scuffs, faded cut-off denim vest over a long-sleeve thermal, old-school shin pads, finger tape on two knuckles. A chromoly BMX in faded sunset orange with gum-wall tyres. Has seen every bail; laughs first | Sunset orange `#E8763A` | Vest and beard; upright, easy stance |
| **Kerb** | Street skater | A woman about 26, olive skin, dark hair in a messy bun under a low-profile matte black skate helmet. Oversized mustard t-shirt, ripped black jeans, worn canvas high-tops. A plain natural-wood deck with grip tape, no graphics. Fearless, laughs through it | Ramp mustard `#D9A63A` | Oversized tee and wide-leg jeans; low crouch |
| **Zip** | Scooter rider | A man about 24 who reads clearly as an adult (stubble, broad shoulders, adult build), pale freckled skin, ginger buzz cut. Grey hoodie with one sleeve cut off, joggers, a matte teal helmet. A plain dark stunt scooter with T-bars and small wheels. Loud, proud, the one with the gap-toothed grin at the end | Dusk teal `#2F5D62` | One bare arm; compact, springy |
| **Dot** | Flatland BMX | A woman about 30, dark brown skin, short locs tied back under a plum helmet, precise and calm. Fitted denim-blue track jacket, slim trousers, flat shoes. A short flatland BMX in bruise plum with four pegs. The technical one; her bails are slow-motion tangles rather than big falls | Bruise plum `#6B3F5E` | Fitted jacket and short bike; balanced spins |

Notes:

- Zip is the rider most likely to be misread as a teenager, because scooters skew young.
  His brief says "adult" in features, not only in age, and every prompt for him repeats it.
- The trial used two stand-in characters (a BMX rider called "Dace" and an unnamed skater)
  before the mechanics names were known. The skater and the scooter rider match Kerb's and
  Zip's briefs closely and can seed their sheets. Dace was a style and consistency test
  only, not a cast member.
- Friends, bystanders and the "medic" who hands over an ice pack are background extras:
  generic, never hurt (mechanics page, section 6).

## 3. Symbols (provisional)

The set follows `docs/research/mechanics.md` section 3 and is **provisional until the
mechanics decision record is accepted**. Every symbol is a centred three-quarter object on a
transparent background, neutral lit, with an 8% safe margin, and must read at 128 px.

| Tier | Symbol | Visual brief |
|---|---|---|
| Rider (high) | **Gramps** | Head and shoulders, three-quarter, grinning, helmet on, orange vest collar visible, BMX bar end behind his shoulder. Orange rim light |
| Rider (high) | **Kerb** | Head and shoulders, laughing, mustard tee, deck held upright behind her, wheels visible |
| Rider (high) | **Zip** | Head and shoulders, cocky grin, teal helmet, scooter T-bar across his shoulders |
| Rider (high) | **Dot** | Head and shoulders, calm half-smile, plum helmet, a peg and front wheel of her bike beside her |
| Gear (mid) | **Helmet** | A scuffed open-face helmet, frayed strap (trialled: section 9) |
| Gear (mid) | **Deck** | A skateboard at a steep angle showing its grip tape and wheels, chipped nose, no graphics |
| Gear (mid) | **Pegs** | A crossed pair of knurled steel BMX pegs, worn bright on the grinding side |
| Gear (mid) | **Bars** | Scooter T-bars with worn foam grips, slight bend; no clamp branding |
| Park junk (low) | **Bolt** | A big rusty hex bolt with nut |
| Park junk (low) | **Wrench** | An adjustable wrench, paint-chipped handle |
| Park junk (low) | **Grip Tape** | A half-used roll of grip tape with a torn edge |
| Park junk (low) | **Traffic Cone** | A battered orange cone, scuffed, one reflective band |
| Park junk (low) | **Sticker Sheet** | A sheet of die-cut abstract stickers: stars, flames, a lightning bolt, simple shapes. No words, no logos, nothing that resembles a real mark |
| Wild | **Kicker** | A plywood launch ramp with a steel lip, in perspective, catching the golden light; a soft glow at the lip. Mustard-orange accent so it stands out from the lows |
| Scatter | **Session Flyer** | A hand-made paper poster taped to plywood: hand-drawn abstract rider silhouette, sun and ramp, torn corner. No readable text in the art; if a word such as "SESSION" is needed it is a vector overlay |

Low symbols use cooler, duller colours and simpler shapes than the gear, and gear simpler than
riders, so the value hierarchy reads by colour and complexity as well as by the paytable.
Rider symbols get **injury variants** only if the mechanics keep injuries on the reels; the
default plan shows injuries on the rig, not on symbols.

## 4. Injuries within rule 8

The mechanics page defines three tiers, chosen per bail and bounded, never accumulating past
tier 3. This page defines how each one **looks**. All are drawn as **decal overlays and part
swaps on the rider's rig** (section 6), so one rider rig serves every injury, and each overlay
can be reviewed on its own against rule 8.

| Level | When (mechanics) | What is shown | How it looks |
|---|---|---|---|
| 0 — Clean | Normal play, landed tricks | The rider as designed, dusty | Dust on shoes and knees, no marks |
| 1 — Scuffed | Every base-game bail; Session pain 1 | Scrapes, road rash, bruises | Road rash: pink-red raw grazes with fine pinpoint dots of blood, never running. Bruise: reddish-purple patch on cheekbone or shin. Torn fabric at elbow or knee showing a graze. Dust smear on clothes |
| 2 — Bleeding a bit | Session pain 2 | Swelling, a bleeding cut, a nosebleed, a split lip | A small cut on the eyebrow or knee with **one thin trickle**. A nosebleed from one nostril to the upper lip, usually being dabbed with a tissue or wrist. A split lip with a bead of blood. A puffy, swollen eye or cheek, purple at the centre. Blood stays small and local; it does not drip onto clothes or ground |
| 3 — Patched up | Session pain 3, **shown only in the patch-up**, never during the crash | A knocked-out tooth, a cast, a sling, a neck brace | A white or coloured cast on a forearm or lower leg, a blue fabric sling, a foam neck collar, a gap-toothed grin, the tooth held up between finger and thumb, butterfly strips and a gauze pad, an ice pack. **Always with a grin and a thumbs-up.** This is the Session's closing card |

Always-present patch-up kit (any level): plasters, gauze, medical tape, an ice pack, a
friend's hand pulling the rider up, a thumbs-up. **Every bail ends on one of these.**

Crash beats cut away on contact (mechanics page, section 6). The impact frame shows motion,
dust and the vehicle flying off, never the body striking the ground or an obstacle.

### Do not show

These are out, whatever the prompt, the tier or the joke:

- Exposed bone, open fractures, and **limbs bent at wrong angles** (a visibly deformed arm or
  leg reads as a fracture even without bone showing).
- Deep wounds, gashes, flaps of skin, visible stitches being put in, wounds being cleaned.
- Gore, blood pools, blood spray or splatter, blood on the ground or the ramp, blood soaking
  clothes, blood running down the face past the chin.
- The moment of impact on the head or face; anything suggesting unconsciousness (closed eyes
  with a limp body, eyes rolled back), seizures, or a stretcher scene played for laughs.
- Death, permanent disability, or a wheelchair used as a gag.
- Riders who look under 18; bystanders being hurt; one person causing another's bail.
- Groin-impact gags (not a rule 8 item, but cheap, and they make the game less shareable).
- Recreations of real fail videos, real riders, real parks, real brands, logos or readable
  brand-like text (rule 7).

Reviewing an injury asset means checking it against both lists above, and recording the
level in its provenance entry (section 7).

## 5. Prompting approach for Codex image generation

Images are generated with the `codex-image` skill: the Codex CLI drives OpenAI's image tool on
the owner's OpenAI plan. In the trial each image took about 60 to 90 seconds. Seven images
ran as parallel jobs in about three minutes in total, at the skill's defaults (model
`gpt-6.1-sol`, low effort). Native sizes are about 1024 to 1672 px on the long edge: square
1254 × 1254, portrait 4:5 1122 × 1402, landscape 3:2 1536 × 1024, 16:9 1672 × 941.

### The style block

Every prompt starts with this block, verbatim. It is long because each sentence fixed
something in the trial.

```text
STYLE: stylized-realistic digital painting for a browser game, like a high-end painted game
key art, not a photograph. Realistic anatomy, proportions and materials (denim, nylon,
scuffed plastic, concrete, chrome, rubber), but with painterly brushwork, slightly simplified
surfaces, clean readable silhouettes and a subtle warm rim light. Lighting: late-afternoon
golden-hour sun from upper left, warm highlights, cool blue-violet shadows. Palette anchors:
sun-baked concrete #C9B79C, dusk teal #2F5D62, valley pine green #3E5B3A, sunset orange
#E8763A, worn denim blue #3B5878, bruise plum #6B3F5E, bandage white #F2EDE4. All people are
fictional adults (mid-20s to 30s). No real people, no brand names, no logos, no readable
text, no stickers with words. Gear is generic and unbranded.
Keep the painterly digital-painting finish of the attached reference image; do not make it
photographic.
```

Swap the lighting sentence for the Session's floodlit dusk, and the age sentence for Gramps
(mid-50s). After the style block, the prompt follows a fixed order: **SUBJECT, TONE (for
injuries), COMPOSITION, BACKGROUND, SHAPE, USE**. The trial prompts are kept with the
originals as a template.

### Character consistency

1. **One master sheet per rider first**: front, three-quarter and side views, full body,
   with the vehicle, on a flat light grey background. Pick the best of a few variants. It is
   the canon, and its prompt's character description becomes that rider's **descriptor
   block**, pasted unchanged into every later prompt for the rider.
2. **Every later image of that rider attaches the master sheet** as a reference image. The
   trial's consistency test held face, moustache, hair, helmet, shirt, trousers and bike
   from a single reference (section 9).
3. **Variants of one image are edits, not new generations.** An injury state, a lighting
   change or a pose tweak resumes the Codex session (`codex-image.sh edit`), which keeps
   what the prompt does not mention. Not yet trialled for injury states; see section 10.
4. **Animation never depends on generation consistency.** The rig reuses the same part
   pixels in every frame (rendering page, option A), so only the master sheet, the part
   sheets and the patch-up cards need to match each other.
5. A **style anchor**, the accepted scene plate, is attached alongside the rider sheet for
   anything with a background, so the lighting and finish match the scene.

### Transparency

Asking for "fully transparent background (PNG alpha)" works: the trial's helmet symbol and
patched-up portrait came back as real RGBA images. But the alpha is not clean enough to ship
as-is:

- **No pixel is fully opaque.** The subject sits at alpha 240 to 254, so it is about 2 to 6%
  see-through and would show the scene through a symbol.
- **Edges carry a colour fringe** from the matting. It shows against dark backgrounds.
- **On the multi-part rig sheet the "transparent" background was a faint haze** across the
  whole image (68% of pixels at alpha 1 to 63) rather than zero.

All three are fixed by a scripted **alpha clamp**: alpha ≤ 24 → 0, ≥ 200 → 255, linear in
between, then a 1 px erosion of the alpha edge. The trial's cleaned helmet and portrait
composite cleanly on magenta. For the haze case, raise the low threshold to about 64. If a
future model returns worse alpha, the fallback is to prompt a flat `#FF00FF` background,
which appears nowhere in the palette, and key it locally.

### Parts for animation rigs

The rendering page proposes cut-out rigs from separately generated parts. The trial's part
sheet, generated with the rider's master sheet attached, showed:

- **Worked:** nine clean, separated, recognisable parts in the right costume (helmeted head,
  torso, upper arm, forearm, open hand, gripping hand, thigh, shin with knee pad, shoe). The
  limb ends came back as rounded skin-coloured caps, which is what joint overlap needs.
- **Didn't:** the parts were not all in the requested side view; some were three-quarter. They
  were not at a consistent scale relative to each other, there was only one of each limb, and
  the alpha haze described above.

Proposed method:

1. Generate **one part sheet per view and per side** (near and far limbs), each with the
   master sheet attached. Ask for a 2 × 3 grid at most per sheet, since fewer parts per sheet
   come back more accurately. The rendering page's alternative, editing each part out of the
   neutral-pose master image one at a time, is slower but keeps scale for free. Trial both
   at the start of milestone 4.
2. **Scale and pivot are set by hand** in the rig tooling, against the master sheet's
   proportions. The generator does not do measurement.
3. Vehicles (frame, wheels, bars, deck, trucks) get their own part sheets, because wheels
   must be separate pieces to spin.
4. **Injury overlays are their own small transparent images** (road-rash decal for forearm
   and knee, torn-sleeve variant, bruise, nosebleed trickle, split lip), generated as edits of
   the relevant part so they line up. Tier 3 items (cast, sling, neck collar) are part swaps.
5. The **patch-up closing card** is a full painted portrait per rider, not rigged. It is the
   one moment the camera holds still, so it can afford the most detail.

### What the image model accepts and refuses

Seven prompts were run, covering every rule 8 item: road rash, bruise, bleeding knee cut,
nosebleed, swelling, a bleeding eyebrow cut with a blood line down the temple, a nosebleed
over the lip, a split lip, a knocked-out tooth held up to camera, a gap-toothed grin, a cast,
a sling, a neck brace and a forehead bandage. **All were accepted on the first attempt; there
were no refusals and no visible watering-down.** Every injury requested was drawn, at about
the strength asked for.

Phrasing that worked, and is recommended:

- Frame the scene as the aftermath and say the rider is okay: "laughing it off", "clearly
  okay and in good spirits", "thumbs-up".
- Name each injury concretely ("a thin trickle", "a bead of blood") rather than with intensity
  words ("bloody", "brutal").
- End injury prompts with the limit sentence: "realistic but limited injuries. No exposed
  bone, no deep wounds, no gore, no pools or spray of blood." It costs nothing, and it keeps
  the model's interpretation inside rule 8.

**Not tested, on purpose:** prompts for anything outside rule 8. The project would never use
the result, so there is nothing to learn. If a rule-8 prompt is refused later, the refusal,
the prompt and the model version go in `docs/findings.md` the same day.

## 6. Asset families and resolution targets

Design resolution is 1920 × 1080 landscape, with a portrait layout for phones. The renderer
caps resolution at `min(devicePixelRatio, 2)` (rendering page), so a texture needs at most 2×
its CSS display size.

| Family | Master (in `art-source/`) | Shipped (in `src/assets/`) | Trial size at that spec |
|---|---|---|---|
| Reel symbols | ~1254 × 1254 PNG, transparent | 512 × 512 WebP (2× a ~256 px cell), plus 256 × 256 for small screens; or one 2048 atlas per family | Helmet: **40 KB** at 512, **14 KB** at 256 (q88) |
| Scene plate, base and Session | ~1672 × 941 PNG (native 16:9) | 1920 × 1080 WebP and 1280 × 720; a separate portrait plate (~1024 × 1536 native) for phones | **259 KB** at 1920 (q80, upscaled 1.15× from native), **151 KB** at 1280 |
| Rider rig | Master sheet and part sheets, ~1254 px each | One WebP atlas per rider, at most 2048 × 2048, holding body, vehicle, injury overlays and tier-3 part swaps | Not built yet. Estimate 400 to 800 KB per atlas |
| Patch-up cards (one per rider) | ~1122 × 1402 PNG | 800 × 1000 WebP, transparent | Zip-like card: **124 KB** |
| UI textures (plywood, grip tape, concrete, coping) | Generated as seamless tiles | 512 × 512 tileable WebP | Not trialled |
| Scar Card, Session Flyer art | ~1254 px | 512 to 800 px WebP | Not trialled |

Everything is far below the 1 MB file limit. A rough full set is 15 symbols × 2 sizes
(~1 MB), 4 rider atlases (~3 MB), 4 scene plates (~1 MB), 4 cards (~0.5 MB) and textures. That
is about 6 MB, well under the 100 MB at which DR-001 says to reconsider. The scene's native
1672 px width needs a small upscale for 1920; that is fine for a background behind reels,
but a sharper upscaler is worth comparing in milestone 4.

## 7. Pipeline: from `art-source/` to `src/assets/`

```text
brief → prompt → generate (art-source/) → review (rules 7 and 8, style) → prepare (script)
      → WebP in src/assets/ → provenance entry → hygiene check → commit
```

1. **Brief and prompt.** Each asset has an id in lowercase kebab case, `<family>-<subject>`,
   for example `symbol-helmet`, `scene-valley-base`, `rider-zip-atlas`, `card-zip-patched`.
   Its prompts live with its originals: `art-source/<family>/<id>/prompt-N.md`.
2. **Generate** with the `codex-image` skill into
   `art-source/<family>/<id>/<id>-vN.png`. `art-source/` is gitignored (DR-001); originals
   never enter git.
3. **Review** before preparing: no brand, logo or readable text; no likeness of a real person
   or place (rule 7); injury level and both lists in section 4 (rule 8); the style block's
   finish, light direction and palette; the rider matches their master sheet.
4. **Prepare with a script, never by hand**, so it is repeatable when art is replaced:
   alpha clamp and edge erosion (section 5), trim to content, pad to the safe margin, resize
   to the targets in section 6, pack atlases for rigs, and encode WebP (quality 80 to 88,
   alpha quality 90, highest effort). The script then fails any output over 1 MB.
   - `tools/` is stdlib-only Python by hygiene rule, so the prep script cannot use Pillow
     there. Proposal: a Node script, `npm run assets`, using `sharp` (libvips) as a dev
     dependency, once the app scaffold exists in milestone 3. The trial used Pillow from a
     scratch script only to take the measurements in this page.
5. **Record provenance** in `src/assets/provenance.json` in the same change, keyed by the path
   relative to that file. The `provenance` check needs `source` and `license`; the other
   fields are allowed and recommended:

   ```json
   {
     "assets": {
       "symbols/symbol-helmet-512.webp": {
         "source": "Generated for this repository with OpenAI image generation through the Codex CLI, alpha-cleaned, resized and compressed by the asset script",
         "license": "Original to this repository, MIT (DR-004)",
         "generator": "Codex CLI image tool, gpt-6.1-sol",
         "date": "2026-11-25",
         "original": "art-source/symbols/symbol-helmet/symbol-helmet-v3.png",
         "prompt": "docs/art/prompts/symbol-helmet.md",
         "rule8": "none"
       }
     }
   }
   ```

   `rule8` records the injury level (`none`, `1`, `2`, `3`) that the reviewer checked, so an
   audit of injury art is a search, not a re-review.
6. **Keep the prompt in git.** Originals stay local, so the final prompt for each shipped
   asset is committed as a short Markdown record (proposed: `docs/art/prompts/<id>.md`). It
   holds the full prompt, the reference images used, the model and the date. The image can
   then be regenerated or explained without the original, and the provenance has a trail.
7. **Check:** `python tools/ci/hygiene.py` (the `assets` and `provenance` checks) before
   committing.

**License note for the lead:** the README example licenses generated assets as "Original to
this repository, MIT (DR-004)". OpenAI's terms assign output rights to the user. Whether a
purely generated image is copyrightable varies by jurisdiction, so "MIT" may in practice mean
"free to reuse". Nobody is harmed by that in a free public project, but the record should not
claim more than it can. This is the owner's call; flagged, not decided here.

## 8. Animation hand-off (what art owes the rig)

Settled in the rendering decision record, summarised here so the art briefs serve it:

- Light from the upper left on every part, no baked cast shadows, neutral grading. The
  renderer adds shadow and the Session's colour grade.
- Joint caps: rounded overlapping ends on every limb piece, as the trial produced.
- Clothing that hides joints helps: rolled sleeves, baggy trousers and knee pads all cover
  elbows and knees, where cut-out rigs look weakest. The cast briefs lean on this on purpose.
- Faces: two or three swappable expressions per rider (grin, wince, dazed-but-smiling) as
  head-part edits, rather than mouth animation.

## 9. The trial

Seven images were generated on 2026-11-25 with the `codex-image` skill (Codex CLI, model
`gpt-6.1-sol`, low effort), saved under `art-source/trial/` (gitignored, not committed).
Prompts used the style block above (except the reference-attachment sentence, which was added
after the results) plus a brief.

| File | Brief | Result | What worked | What didn't |
|---|---|---|---|---|
| `rider-01.png` 1536 × 1024 | Master sheet: BMX stand-in "Dace", 3 views, grey background | Accepted | Strong consistency across the three views. Painterly finish as asked, palette and golden light right, no logos or text on the unbranded bike | The bike was placed between the views; ask for "views on the left, vehicle on the right". The side view's cargo pocket differs slightly |
| `symbol-01.png` 1254² RGBA | Helmet symbol, transparent | Accepted | Clear silhouette, scuffs and frayed strap, readable at 128 px, real alpha | Fills slightly more than the 80% asked. Subject alpha 240 to 254 and edge fringe, fixed by the clamp. A painted crack: fine, but crack is a tier-of-damage cue worth deciding on |
| `bail-01.png` 1122 × 1402 | Skater bail aftermath, tier 1–2: road rash, knee cut, nosebleed, cheek bruise, thumbs-up | Accepted | Every injury drawn, at the requested strength, clearly within rule 8; the tone reads as a laugh, not a tragedy. A good seed for Kerb | **Drifted to photographic finish** with no reference attached; Codex said so itself. Dabbing with a tissue instead of the wrist, which is better |
| `cast-01.png` 1122 × 1402 RGBA | Scooter rider, tier 3: cast, sling, neck brace, split lip, tooth gap, bandage, black eye, thumbs-up, transparent | Accepted | All items present; the knocked-out tooth gap and grin land exactly the intended joke. Usable alpha after the clamp. A good seed for Zip | Also leans photographic. The cast is drawn in two pieces with the elbow showing, which a reviewer would catch. Scooter deck cropped at the frame edge; ask for margin |
| `setting-01.png` 1672 × 941 | Folk Valley scene plate, calm centre | Accepted | Calm centre as asked on the first try. Painterly, original, a convincing DIY park; abstract hand-painted board with no text, water tower with no lettering | Native width needs a 1.15× upscale for 1920. The ground plane is very empty; reels will cover it, but a portrait crop needs its own plate |
| `consist-01.png` 1254² | Dace after a bail, **rider sheet attached**; eyebrow cut with a blood line, nosebleed over the lip, split lip, tooth held up, road rash, thumbs-up | Accepted | **Consistency from one reference was very good**: face, moustache, helmet, shirt, trousers, gloves and bike all match. Kept the painterly finish (the reference carried the style). The strongest rule-8 injury set was drawn without hesitation and still reads as okay | Blood line is about the upper limit of what level 2 should show; the overlay briefs should say "thin line, stops at the cheek" |
| `parts-01.png` 1254² RGBA | Rig part sheet of Dace, side view, transparent, rider sheet attached | Accepted | Nine separated parts in matching costume with rounded skin caps at joints, which is usable as a starting point | Mixed side and three-quarter views, inconsistent relative scale, one of each limb only, and an alpha haze over the whole background |

Measured after the scratch prep (alpha clamp, trim, resize, WebP): helmet symbol 40 KB at
512 px and 14 KB at 256 px; scene 259 KB at 1920 × 1080 and 151 KB at 1280 × 720; patch-up
card 124 KB at 792 × 1000. The prepared files and magenta-composited alpha previews are in
`art-source/trial/processed/`.

**Conclusions:** the generator can carry this art direction and every rule-8 injury. The two
real risks are style drift towards photography and matting quality. A painted reference on
every prompt answers the first, and a scripted alpha clean-up answers the second. Rig part
sheets need more prompt work and a manual scale pass; they are the biggest remaining unknown.

## 10. Open questions

For the lead or the owner:

1. **Helmets for everyone.** Proposed for tone and to keep head injuries off the table. Does
   the owner want a rider without one, for realism of street skating?
2. **Injury edits on one image.** Not trialled: generating a clean pose, then editing in level
   1, 2 and 3 on the same image. That is the cheapest way to make consistent injury overlays.
   Trial it first in milestone 4.
3. **Rig parts: sheets or one-at-a-time edits** (section 5). Both need a trial against the
   same master sheet; the winner goes in the rendering record.
4. **License wording** for generated assets in the provenance manifest (section 7).
5. **Where prompt records live**: `docs/art/prompts/` proposed; the lead may prefer next to
   the manifest, but Markdown under `src/assets/` mixes docs with shipped files.
6. **Gramps's age**: mid-50s makes "veteran" read instantly. Older risks "old man falls" humour
   that feels mean rather than funny.

## 11. Proposed decision record

The number is left for the lead to assign.

### DR-0XX — Art direction: stylized-realistic painting, generated through Codex with reference anchors

- **Status:** proposed, 2026-11-25
- **Context:** Folk Valley's art is meant to be fairly realistic, with injuries that are
  somewhat graphic but within rule 8 (DR-003). It is generated with OpenAI image generation
  through the Codex CLI, which cannot draw the same character twice reliably. Its
  transparency output is close but not clean. The game needs hundreds of consistent images
  (symbols, four riders with rig parts and injury overlays, scenes, cards) under DR-001's
  1 MB-per-file budget, every one with its provenance recorded (rule 7). A trial of seven
  images is recorded in `docs/research/art-direction.md`.
- **Decision:** The look is stylized-realistic painting: realistic anatomy, materials and
  light, finished as digital painting, lit from the upper left at golden hour (base game)
  and floodlit dusk (Session), in the palette of the research page. It is set in Folk
  Valley, an original DIY park in a pine river valley. The cast is four helmeted adults
  (Gramps, Kerb, Zip, Dot). Injuries follow three bounded tiers drawn as rig decals and part
  swaps, with tier 3 only in the patch-up, and the research page's do-not-show list applies
  in addition to rule 8. Every generation prompt starts with the fixed style block, attaches
  the rider's master sheet and a style anchor, and makes variants by edit. No text is ever
  baked into images. Originals stay in `art-source/`. A script, not a person, cleans alpha,
  resizes, packs atlases and encodes WebP. Every shipped file gets a provenance entry with
  its injury level, and its final prompt is committed as a Markdown record.
- **Alternatives:** Photorealism, rejected because generated faces drift visibly, risk
  resembling real people, make cut-out rig seams obvious and make injuries read as medical
  photos. Cartoon style, already rejected by DR-003. Hand-painted or commissioned art,
  rejected for cost and speed in a free project, though it remains compatible with this
  pipeline. Pre-rendered or generated video for riders, rejected in the rendering research
  (consistency, DR-001 formats).
- **Consequences:** Rider consistency rests on the master sheets, so they are made and
  accepted first and replacing one means regenerating that rider's parts and cards. Every
  injury asset is reviewed against rule 8 and the do-not-show list, and its level recorded.
  The prep script becomes a dev dependency (`sharp`) in milestone 3. Rig parts are the main
  open risk and need a trial before milestone 4's art is scheduled. If the image model's
  policy, style or alpha output changes, the trial is rerun and the result goes in
  `docs/findings.md`.
