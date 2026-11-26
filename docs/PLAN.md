# Folk Valley — plan

The plan of record: what is being built, in what order, and why it is built that way.
Change it like code: small edits straight on `test`, larger ones in the pull request that
needs them. When the plan and the code disagree, one of them is wrong; find out which.

## 1. What this is

A free, educational slot-machine simulator about bike, skate and scooter tricks and the bails
that come with them. Virtual credits only.

Riders attempt tricks during ordinary spins and in the bonus; a trick either lands or ends in
a bail, the Folk Valley moment, and both outcomes feed the game. The simulator is for people
curious about how slot machines actually work: every result is decided by transparent,
seeded math before anything is animated, and the measured return to player is shown beside
the theoretical one. It is done when it plays in a browser, looks and sounds finished, and
its statistics agree with its math. Nothing in it can be bought, deposited or cashed out.

## 2. Architecture

Planned; folders are created as their milestones start. The rendering and animation
technology is decided in milestone 1, so nothing here names a framework.

| Module | Owns | Rules inside it |
|---|---|---|
| `src/engine/` | Seeded RNG, reel strips, paytable, trick and bail features, payout evaluation, theoretical RTP | Pure TypeScript with no UI, renderer, browser, audio or animation dependency, so the math runs and is tested on its own (`AGENTS.md` rule 5). A spin is a function of configuration and seed |
| `src/worker/` | High-volume simulation runs and their statistics | Runs off the main thread, so a million spins never freeze the page |
| `src/presentation/` | Turning a finished spin result into a timeline: reel stops, trick attempts, bails, wins | Reads a result, never changes one (rule 4): if presentation could alter an outcome, the shown game and the measured math would diverge |
| `src/renderer/` | The game scene | Draws the timeline it is given |
| `src/ui/` | Everything around the scene: controls, balance, statistics panel | Simulated figures are labelled, and theoretical values are kept apart from observed ones (rule 6) |
| `src/assets/` | Shipped, compressed art and audio, and `provenance.json` | Web formats under the size budget, each with a recorded source and license (DR-001, DR-004) |

## 3. Milestones

Each milestone is independently shippable, closes when its gate passes, and is released as
the next minor version ([`RELEASING.md`](RELEASING.md)). Milestones 2 to 5 are firmed up
when milestone 1 closes.

| # | What it delivers | Gate (definition of done) | Due |
|---|---|---|---|
| 0 | Repository, CI and docs skeleton | This plan, hygiene CI green on `test` and `main`, a fresh clone passes `python tools/ci/hygiene.py` | |
| 1 | Game design research | Accepted decision records for the mechanics (tricks and bails in ordinary spins, the bonus), the math targets (RTP, volatility, hit rate), the rendering and animation approach, and the art direction | |
| 2 | Engine and simulation | The seeded engine with unit tests for payouts, reproducibility, configuration validation and RTP; a Worker simulation whose measured RTP agrees with the theoretical value within its stated tolerance | |
| 3 | Playable prototype | The app scaffold with placeholder art: spin, trick and bail presentation, the statistics panel, CI that builds and runs the unit and browser tests, and the animation spike that settles cut-out rigs against flipbooks (DR-007) | |
| 4 | Art, animation and audio | Final realistic art and animation within `AGENTS.md` rule 8, audio, every asset in `src/assets/provenance.json` | |
| 5 | Polish and first public release | Mobile and accessibility pass, a GitHub Pages deploy, and `v0.5.0` released | |

## 4. Testing and measurement standards

- Every claim that something got better or worse has a control arm: the same setup without
  the change, run alongside it. A single before/after run is an anecdote.
- A simulated RTP is reported with its number of spins, its standard error and the seeds
  used. The theoretical RTP comes from the math model, never from a simulation; the
  simulation is how we check it.
- Findings go in [`findings.md`](findings.md) the day they are taken.

## 5. Decision records

A decision that costs more than an hour to reverse gets a record here, numbered and never
renumbered. A superseded record stays, marked superseded, with a link to the one that
replaced it.

### DR-001 — Assets are compressed web files in plain git, not Git LFS

- **Status:** accepted, 2026-10-18
- **Context:** The game ships art and audio, and its deploy and browser tests need the real
  files. With Git LFS, every CI run and deploy that checks them out counts against GitHub's
  free LFS bandwidth of about 1 GB a month, which realistic art would exhaust quickly on a
  project whose CI runs on every push to `test`.
- **Decision:** Commit only compressed web formats (WebP, AVIF, PNG, OGG, M4A, WOFF2) as
  plain binaries, each at most 1 MB. Full-size originals stay in the ignored `art-source/`
  folder. The hygiene check `assets` enforces both; the limits are in `tools/ci/config.json`.
- **Alternatives:** Git LFS for every binary, rejected for the bandwidth cost above and
  because every checkout would need `lfs: true`. Keeping assets outside the repository,
  rejected because the build would then depend on something not versioned with it.
- **Consequences:** Clones stay small only while assets stay compressed, so the size budget
  matters. Every committed binary stays in history forever, so replacing art often is
  costly. Revisit if the total shipped assets grow past about 100 MB, or if originals ever
  need to be versioned.

### DR-002 — `main` is the default branch and is released by fast-forward from `test`

- **Status:** accepted, 2026-10-18
- **Context:** The project has one owner. Small changes go straight to `test`, and major
  features get a branch and a pull request into `test`. A release should be exactly
  something that was tested.
- **Decision:** `test` is the integration branch; `main` is GitHub's default branch and the
  release branch. `main` only moves when a release is cut, by fast-forwarding it to `test`,
  then a `v` tag on `main` publishes the release. Pull requests into `test` merge with a
  merge commit that carries the description, and feature branches are deleted once merged.
  `test` is protected: pull requests into it need the *Hygiene checks* status check, and it
  refuses force-pushes and deletion, while the owner's own pushes go straight through.
  `main` is not protected, because only the owner pushes to it; the fast-forward push
  refuses anything else on its own. No review is required anywhere, because a sole owner
  cannot approve their own pull requests.
- **Alternatives:** `test` as the default branch, which would make pull requests target it
  automatically and close issues on merge; declined in favour of `main` showing the released
  state. Merging `test` into `main` through a pull request, rejected because each one adds a
  merge commit that exists only on `main`, so the branches drift apart.
- **Consequences:** Every pull request must choose `test` as its base (`--base test`).
  Issues close when their work reaches `main` in a release, not when it merges into `test`.
  Issue forms and the pull request template are read from `main`, so changes to them appear
  after the next release. Nothing on GitHub stops a mistaken push to `main`, so the rule
  against it lives in `AGENTS.md`; protect `main` if anyone else ever gets write access.

### DR-003 — Injuries are realistic but limited

- **Status:** superseded by DR-009, 2026-11-25
- **Context:** The game is named after a joke among friends: a Folk Valley moment is when a
  rider bails and gets hurt. The art is meant to be realistic, with injuries that are
  somewhat graphic but not extreme. The repository is public and the art is generated with
  an image model that has its own content policy.
- **Decision:** `AGENTS.md` rule 8. Scrapes, road rash, bruises, swelling, bleeding cuts,
  nosebleeds, split lips, a knocked-out tooth, casts, slings and neck braces are in. Exposed
  bone, open fractures, deep wounds, gore, heavy blood spray, dismemberment, and death or
  permanent injury played for laughs are out. Riders are adults, and every bail ends with
  the rider patched up and okay.
- **Alternatives:** Cartoon-only injuries, rejected because the art direction is realistic.
  Fully graphic trauma, rejected because the humour depends on the rider being okay, and
  because the image model would refuse or water it down, giving inconsistent art.
- **Consequences:** Every injury asset and animation is reviewed against rule 8. The line is
  written down, so it does not drift one generated image at a time.

### DR-004 — MIT for code and documentation; each asset's rights recorded separately

- **Status:** accepted, 2026-10-18
- **Context:** A public repository needs clear reuse terms from its first commit. Generated or
  third-party media can carry terms that differ from the code's.
- **Decision:** Code and original documentation are under the MIT License in `LICENSE`.
  Assets are not assumed to be MIT: each one's source and license are recorded in
  `src/assets/provenance.json`, and the hygiene check `provenance` fails an asset with no
  entry.
- **Alternatives:** No license until a release, rejected because an unlicensed public
  repository is ambiguous. MIT for everything, assets included, rejected because media
  rights and generator terms may need separate treatment. A copyleft license was not chosen
  for an educational project; changing it needs a superseding record.
- **Consequences:** Adding an asset means recording where it came from. Contributors must
  have the right to submit what they add.

### DR-005 — Ways pays, Kicker tricks with a per-bet Scar Card, and a trick-ladder Session

- **Status:** accepted, 2026-11-25
- **Context:** Tricks have to be a mechanic, not decoration, and a bail has to matter as much
  as a landing. The engine decides every attempt before it is shown (rule 4), and every event
  needs a one-sentence explanation. The full research is
  [`research/mechanics.md`](research/mechanics.md).
- **Decision:** A 5×3 grid paying 243 ways, with four rider, four gear and five low symbols,
  a Kicker wild on reels 2–4 and a Session Flyer scatter. A spin with a Kicker starts one trick
  attempt whose rider, tier and land-or-bail outcome the engine draws after the stops. A landed
  trick turns the Kicker's reel wild, and more for harder tricks. A bail adds a mark to a
  **Scar Card kept per bet level, which persists between spins**. Three Flyers or a full card
  start a Session: free spins with one attempt per spin up a trick ladder, where a landing
  raises the multiplier and a bail raises pain, ending the Session at pain 3. The whole Session
  is resolved with the triggering spin. Outcome and cosmetic draws use separate seeded
  streams. No feature buy and no gamble step.
- **Alternatives:** Paylines (the fallback), cluster pays, self-contained attempts with no
  meter (declined by the owner: a bail would feed nothing), sticky bandaged symbols, a
  hold-and-respin bonus, and a player choice of line. The research page says why for each.
- **Consequences:** The engine carries the Scar Card between paid spins, so theoretical RTP is
  computed over the card's stationary distribution, and the statistics panel shows the card's
  share of RTP. The Session is bounded, so its maximum win is a stated number. The spin result
  records every attempt, bail, injury and ladder step, and is the presentation's only input.

### DR-006 — 96% RTP, medium volatility, proven by an analyser and checked by simulation

- **Status:** accepted, 2026-11-25
- **Context:** The game teaches how slot math works, so its figures must be computed, not
  sampled, and the engine must be shown to match them. The full research is
  [`research/math-targets.md`](research/math-targets.md).
- **Decision:** One configuration at a theoretical RTP of 96.0%, the same at every bet level.
  Medium volatility: σ of 4–7× bet per paid spin, a hit frequency of 28–35%, and a max win
  capped at 2,500× bet. Starting split: base game 55%, trick feature 13%, Session 28%. The
  Session triggers about 1 in 150 paid spins and a trick attempt about 1 in 8–12. A
  pure-TypeScript analyser computes every theoretical figure: exact enumeration for the base
  game, a Markov chain for the ladder and the Scar Card, and a dynamic programme for the
  Session. Simulation verifies the engine with fixed, recorded seeds against a tolerance of
  4·σ/√N. The RNG is `xoshiro128**` with one derived stream per paid spin, and rejection
  sampling for ranges.
- **Alternatives:** A second 88% configuration (declined by the owner), high or medium-high
  volatility, verifying RTP by simulation alone, and `mulberry32` or a single sequential
  stream. The research page says why for each.
- **Consequences:** The analyser is real milestone 2 work, and every mechanic must stay
  analysable, with bounded state. Full enumeration runs outside the unit-test loop. The CI
  time budget for it is still open.

### DR-007 — PixiJS 8 renders the scene; riders are cut-out rigs on an in-repo runtime

- **Status:** accepted, 2026-11-25
- **Context:** The scene is 2D and realistic-looking, and the art comes from an image
  generator that is poor at consistent multi-frame sequences. DR-001 rules out video. The full
  research is [`research/rendering.md`](research/rendering.md).
- **Decision:** PixiJS 8 renders the scene inside a React 19 + TypeScript app built with Vite,
  tested with Vitest and Playwright. Riders are cut-out rigs assembled from separately
  generated parts, packed into one WebP atlas per rider, and animated by a small in-repo rig
  runtime with JSON keyframe clips. Bail tumbles may be authored offline with a physics
  ragdoll, but are baked into clips; no physics runs in the browser. `src/presentation/`
  turns a spin result into a plain-data timeline that a player renders on an injectable
  clock, so turbo is a speed, skip is a seek, and tests drive the clock.
- **Alternatives:** Phaser, Three.js, Spine (the upgrade path if an animator joins),
  DragonBones, Rive, generated video, and a live ragdoll. Fallback if cut-outs look like
  paper: key-pose flipbooks made by editing one reference image.
- **Consequences:** We maintain the rig runtime and its clip format. Milestone 3 includes an
  animation spike that settles cut-out rigs against flipbooks before milestone 4's art budget
  is committed.

### DR-008 — Stylized-realistic painting, generated through Codex with reference anchors

- **Status:** accepted, 2026-11-25
- **Context:** The art is meant to be fairly realistic, with injuries within rule 8 (DR-003),
  and the image generator cannot draw the same character twice reliably. A trial of seven
  images, all accepted by the model, is in [`research/art-direction.md`](research/art-direction.md).
- **Decision:** The look is stylized-realistic digital painting in golden-hour light, with
  floodlit dusk for the Session, set in Folk Valley, an original DIY park in a pine river
  valley. The cast is four adults: Gramps (veteran BMX), Kerb (street skate), Zip (scooter)
  and Dot (flatland BMX). Kerb rides without a helmet; the others wear one. Injuries use three
  levels, scuffed, bleeding a bit and patched up, drawn as rig decals and part swaps; the
  third appears only in the closing patch-up card. The research page's do-not-show list
  applies on top of rule 8: no impact moment, no unconscious-looking rider, no blood on the
  ground or soaking clothes. (Its ban on bent limbs and exposed bone is lifted by DR-009,
  which also adds a fracture level before the patch-up.) Every prompt starts with a fixed style block and
  attaches the rider's master sheet. A script cleans, packs and encodes WebP from
  `art-source/`, and every shipped file gets a provenance entry with its injury level.
- **Alternatives:** Photorealism, cartoon (already rejected by DR-003), commissioned art, and
  video.
- **Consequences:** Each rider's master sheet is made and accepted first. Every injury asset is
  reviewed against rule 8 and the do-not-show list. Rig parts are the main risk and are
  trialled in the milestone 3 spike.

### DR-009 — Broken limbs and visible bone are allowed, behind a gore setting that defaults to Full

- **Status:** accepted, 2026-11-25; supersedes DR-003 and amends DR-008's injury levels
- **Context:** After the art research, the owner wanted the worst bails to look properly
  broken: limbs bent the wrong way and, in the worst case, bone showing. The art is generated
  with OpenAI image generation through Codex, which is likely to refuse realistic open
  fractures. The owner's home ComfyUI server (degenerator) is available as a fallback.
- **Decision:** `AGENTS.md` rule 8 now allows limbs bent at wrong angles and open fractures
  with visible bone, at a new **broken** injury level between "bleeding a bit" and "patched
  up". It is shown briefly at the bail, never at the moment of impact, and always followed by
  the patch-up card with a cast and a thumbs-up. Still out: gore beyond a fracture (organs,
  deep gashes, flaps of skin), blood pools or spray, dismemberment, unconscious-looking
  riders, and death or permanent injury played for laughs. The game gets a **gore setting,
  Full by default**: Mild swaps the broken level for its patched-up card and hides blood.
  Codex image generation stays the first choice for every asset. Only when it refuses does
  the same request go to ComfyUI on degenerator, usually as an edit of an existing Codex
  image so the rider stays consistent. Each asset's provenance entry names the tool and model
  that made it, and that model's license.
- **Alternatives:** Keeping DR-003's limit, which the owner declined. Bent limbs without bone,
  the lead session's recommendation, declined in favour of the full range. No gore setting,
  rejected so that players can turn it down.
- **Consequences:** The mechanics gain a fourth injury level, and the Session's pain 3 maps to
  it; the spin result names the level, so the gore setting is purely a presentation choice
  and never changes an outcome (rule 4). Every broken-level asset needs a Mild counterpart.
  The game and its README carry a content note about realistic injuries. Some assets come
  from a second model with its own license, recorded per file. Revisit if playtests show the
  broken level stops reading as funny.

### DR-010 — Milestone 1's open questions, settled

- **Status:** accepted, 2026-11-25
- **Context:** The research pages ended with questions for the owner. These are the answers,
  so the engine work in milestone 2 starts from settled ground.
- **Decision:**
  - **Exact RTP analysis runs nightly and on demand,** not on every push. Pushes run the unit
    tests, including the small exact fixtures and short seeded simulations; the full
    enumeration, the Markov and DP analysis and the long simulations run in a scheduled job.
  - **The Scar Card is saved in the browser** with the virtual balance, so a reload keeps it.
  - **Bails pay nothing.** A bail adds a Scar Card mark and nothing else.
  - **No player choices change expected value.** There is no bank-or-push decision and no
    choice of line in the first version.
  - **One configuration** at every bet level, as DR-006 says.
  - **The patch-up card may show a friend filming the bail on a phone.** It is the Folk Valley
    joke. The friend is an original adult character, and the phone shows no real app or brand.
  - **The four riders stay as designed** (DR-008); none is based on a real person. Gramps
    stays mid-50s, and his master sheet is regenerated to look it.
  - **Prompt records live in `docs/art/prompts/`.** Each generated asset's license wording
    follows its model's terms.
- **Alternatives:** Each research page lists the alternatives for its question.
- **Consequences:** CI gets a scheduled workflow for the analysis in milestone 2. The engine's
  state for a player is the Scar Card per bet level, saved beside the balance.

### DR-011 — Integer coins, a versioned per-spin seed derivation, and a versioned result format

- **Status:** accepted, 2026-11-25
- **Context:** Milestone 2's foundation fixes three things that are costly to change once
  parallel work builds on them: how amounts are counted, how a spin's random numbers are
  derived from a seed, and the shape of the spin result. Changing either of the last two
  after results are recorded breaks every recorded seed and every replay. The detail is in
  [`src/engine/README.md`](../src/engine/README.md).
- **Decision:**
  - **Amounts are integer coins.** A paid spin costs `bet.coinsPerSpin` coins (20 in the
    placeholder); ways pays are coins per way; the bet level is credits per coin. Every win
    is pay × ways × multiplier in integers, so the analyser can be exact, and RTP is the same
    at every bet level by construction.
  - **Seed derivation `xoshiro128ss-v1`.** A 64-bit master seed in 16 hex digits. Spin *i*'s
    seed is the (*i*+1)-th SplitMix64 output from the master seed. Each spin has an outcome
    and a cosmetic stream, seeded by the spin seed XOR a fixed tag, with the `xoshiro128**`
    state taken from the first two SplitMix64 outputs of that seed. Text seeds are FNV-1a 64
    plus SplitMix64's mix (`fnv1a64-splitmix-v1`). Golden vectors pin all of it.
  - **Result format version 1.** `SpinResult` is plain data recording the stops, every win,
    every attempt with its rider, tier, outcome and injury level and id, the Scar Card before
    and after, and the whole Session. It is the presentation's only input.
  - **Configuration is validated whole and never repaired.** The validator takes `unknown`,
    reports every problem with its path, and refuses rather than clamps. Injury ids must come
    from one reviewed catalogue in the engine, which carries rule 8 into code.
- **Alternatives:** Fractional pays in multiples of the bet, rejected because the analyser
  would then work in floats and "exact" would need an error bound. BigInt for the 64-bit
  seeding, rejected for speed in million-spin runs; the 32-bit-limb arithmetic is checked
  against BigInt in the tests. A counter-based generator per draw, rejected as unneeded: one
  derived stream per spin already lets any spin replay alone. Configuration as JSON files
  only, deferred: the types allow it, and validation already treats input as `unknown`.
- **Consequences:** Any change to the generator, seeding or derivation is a new RNG version
  with new golden vectors, and results record which version made them. A change to the
  result's shape is a new `RESULT_FORMAT_VERSION`, and presentation must handle it. Bet levels
  are part of the configuration, because each has its own Scar Card.

### DR-012 — The draw order after the stops, and Flyers before a filling Scar Card

- **Status:** accepted, 2026-11-25
- **Context:** DR-011 fixed how each paid spin's two streams are derived but left the order
  of the draws after the reel stops to the features work. That order is part of what a seed
  replays, so changing it later breaks every recorded seed. DR-005 also lets a spin start a
  Session from 3+ Flyers or from a full Scar Card, and a spin with a Kicker bail and three
  Flyers can do both, while a paid spin starts at most one Session (no retriggers).
- **Decision:**
  - **Outcome stream, in order:** the base stops (one draw per reel, reel 1 first); if a
    Kicker shows, the rider, the tier, land or bail, then on a landing one draw per extra
    wild reel; if a Session starts, its rider, then for each free spin its stops and its land
    or bail. **Cosmetic stream, in order:** the base trick id, then on a bail its animation
    and injury id; for each free spin its trick id, then on a bail its animation and injury
    id; then the Session's closing card. The full list is in
    [`src/engine/README.md`](../src/engine/README.md), and a golden full-spin test pins it.
  - **Flyers win, and the card holds its last mark.** When the bail that would fill the card
    comes on a spin with 3+ Flyers, the Session starts from the Flyers (with their start rung)
    and the card does not take that mark: it stays one short of full, and the next bail fills
    it. The card's Session is postponed, never lost.
- **Alternatives:** Filling and resetting the card anyway, rejected: the player's card would
  be spent on a Session they were getting regardless. A pending "full" card that triggers on
  the next spin, rejected: it adds a state the card cannot otherwise be in and a Session on a
  spin that showed nothing. Choosing the trigger with the higher start rung, rejected as
  harder to state for no gain at the placeholder's rungs. Drawing all cosmetics before the
  outcomes, rejected: the streams are separate, so the order across them does not matter,
  and drawing cosmetics as each event happens reads like the result.
- **Consequences:** The Scar Card's Markov chain has one extra transition: at size − 1, a bail
  with 3+ Flyers stays at size − 1. The analyser models that, and its split credits the
  Session to Flyers. Any change to the order is a new decision and new golden values.

### DR-013 — The tuned configuration `folk-valley-96-v1`, and how its figures are computed

- **Status:** accepted, 2026-11-25
- **Context:** DR-006 set the math targets and asked for an analyser that proves them, and
  the placeholder configuration simulated about 73% RTP with features far too frequent
  ([`findings.md`](findings.md)). Milestone 2 needs one real configuration whose every
  theoretical figure is computed, and an analyser fast and exact enough to tune with. Once
  the game ships, its numbers are what every recorded seed, finding and statistics panel
  refers to, so changing them later is costly.
- **Decision:**
  - **The configuration** is `FOLK_VALLEY_CONFIG`, id `folk-valley-96-v1`, in
    [`src/engine/folk-valley-config.ts`](../src/engine/folk-valley-config.ts). Same symbols,
    rules and units as the placeholder; only numbers changed. A spin costs 20 coins. Base
    strips of 52, 83, 82, 83 and 52 stops with one Kicker on each of reels 2–4 and seven
    Flyers; separate Session strips of 51–53 stops, richer in riders and gear, with two
    Kickers on each of reels 2–4 and no Flyers. Ways pays from 11–12 coins per way (low,
    3 of a kind) to 900 (Gramps, 5). Trick tiers easy, medium, hard weighted 6 : 3 : 1, landing
    36%, 26% and 6%: easy turns the Kicker's reel wild, medium does that at 2×, and hard turns
    one more reel wild. A Scar Card of 14 marks. Sessions start with 12 free spins on a six-rung
    ladder at 1, 2, 3, 4, 6 and 8×, landing from 73.9% at the bottom to 59.3% at the top, one
    spin added per bail before pain 3, starting one rung up per Flyer past three.
  - **Its theoretical figures** (the analyser's, under the Scar Card's stationary
    distribution): RTP 95.997% with the cap (DR-006: 96.0% ± 0.05 pp); split base game 55.5,
    trick uplift 13.2, Session 27.3 points; σ 5.72× bet per paid spin; hit frequency 31.2%,
    win above bet 17.2%, LDW 14.0%; a trick 1 in 9.5 paid spins (30% land); a Session 1 in
    141 (1 in 191 from the card, 1 in 543 from Flyers), averaging 38.5× bet. Every DR-006
    target is met. The full report is in [`findings.md`](findings.md).
  - **The split DR-006 tunes to counts only the trick's uplift**: the plain ways win of every
    grid is the base game, and what a landing adds (its wild reels and multiplier) is the
    trick, as math-targets section 3 says. The statistics' split, which counts the whole win
    of a landed spin as the trick's, is reported beside it (18.2 points for the trick).
  - **How the analyser computes it** ([`src/engine/README.md`](../src/engine/README.md#the-analyser)):
    the base game by a dynamic programme over reels, checked cell by cell against brute force
    over every combination of distinct windows; the trick per tier, Kicker reel and wild set;
    the Session as a Markov chain over (rung, pain, spins left), with exact moments in
    rationals and its distribution in whole coins truncated at the cap; the Scar Card as a
    chain with DR-012's held mark. Uncapped figures are exact fractions; the capped and
    distributional ones are float64 sums of non-negative products, with a stated relative
    error bound near 10⁻¹⁰.
  - **Long runs use σ for consecutive spins.** The card spaces its Sessions more evenly than
    chance, so the σ of a long run of play (5.04) is below the per-spin σ (5.72). DR-006's
    volatility class uses the per-spin σ; tolerances on consecutive spins may use the
    long-run one, which the analyser also reports.
  - **The nightly budget** that DR-006 left open: the full analysis, brute force over about
    1.5·10⁹ base combinations, and 10⁸ paid spins in a 20-seed sweep, in one scheduled job
    that is not a required check (`.github/workflows/nightly.yml`).
- **Alternatives:** Tuning by simulation, rejected by DR-006. Brute force as the analyser,
  rejected as too slow to tune with (two minutes per evaluation, against 40 ms for the reel
  sweep, which gives the same cells). An FFT for the Session's convolutions, rejected because
  its absolute rounding errors would swamp the far tail where the cap lives. A top multiplier
  of 15×, which put σ at 8.9 and the Session at 42 points. Cards of 5 and 10 marks, which made
  Sessions too frequent once the trick rate was right. Easy tricks landing half the time,
  which put the trick near 15 points.
- **Consequences:** Any change to the strips, pays or weights is a new configuration id, a
  fresh analysis and a findings entry; the pinned figures in `tests/engine/analyser.test.ts`
  fail until then. The placeholder stays only as a fixture for the golden draw-order tests.
  **The cap is effectively unreachable:** a paid spin reaches 2,500× with probability about
  10⁻¹⁶, where math-targets hoped for roughly 1 in 5–50 million. The cap still bounds the
  variance and the stated max win, but the panel must not imply it is a realistic outcome.
  Revisit with a heavier tail (a rare, steep top rung) if a reachable top prize matters; it
  costs σ and needs a retune. With a 14-mark card a nearly full card is worth noticeably more
  than an empty one, the state dependence DR-005 accepted; the panel shows the card's share.

### DR-014 — The presentation timeline: a versioned list of back-to-back events

- **Status:** accepted, 2026-11-25
- **Context:** DR-007 put a pure timeline between the spin result and the renderer. The
  renderer, the DOM narration, audio and the browser test hook all read it, so its shape is
  a contract several modules are written against at once, and changing it later means
  changing all of them.
- **Decision:**
  - **`buildTimeline(result, options, timings)`** in [`src/presentation/`](../src/presentation/README.md)
    is a pure function to a `Timeline` of typed events (21 kinds), each with a start and a
    duration in whole milliseconds, a role (`motion` or `information`), a narration line and
    the values it shows, copied from the result. It only orders and times what the result
    says (rule 4).
  - **Events run back to back**: each starts where the one before ends, so at most one is
    active at a time and "what is active at t" is a lookup. Overlap, if the renderer wants
    it, is the renderer's (an event's renderer may keep drawing after its event ends).
  - **Options are presentation only**: gore (Mild drops the `broken` injury beat, marks the
    bail's patch-up as standing in for it, and hides blood, DR-009), reduced motion (motion
    beats shorten to still crossfades, information beats keep their length), and turbo
    (every duration divided by a factor, 2.5 by default). None changes which outcomes appear.
  - **Skip is a seek to the end** that reports every event it passes as completed, so a
    renderer applying end states shows every outcome. The player reads an injected clock.
  - **`TIMELINE_FORMAT_VERSION`**, starting at 1, is recorded in every timeline next to the
    result's format version. A change to an event's shape, a kind added or removed, or a
    change to the order contract is a new version; tuning a duration is not.
- **Alternatives:** Overlapping tracks (reels, rider, meters, camera) in parallel, rejected
  for now: they make "what is active" ambiguous and the order harder to test, and the beats
  the research describes are sequential. Timings inside the renderer, rejected because turbo,
  skip and reduced motion would then each be a code path rather than data. An unversioned
  schema, rejected because the browser tests and saved replays would break silently.
- **Consequences:** The renderer draws an event as a function of time within it. Adding a
  beat means a new kind, a new format version, the README's table and the tests' expected
  order together.

### DR-015 — Riders move as cut-out rigs; painted held frames carry the beats after the cut

- **Status:** accepted, 2026-11-26; settles DR-007's spike
- **Context:** DR-007 chose cut-out rigs, with key-pose flipbooks as the fallback, and asked a
  milestone 3 spike to settle it. The spike built both for Kerb, an ollie and a bail
  ([`research/animation-spike.md`](research/animation-spike.md), [`findings.md`](findings.md)).
  The rig moved smoothly and fit in 74 KB but looked like a puppet in sprawled poses; the
  flipbook looked like the painting but jumped between poses, drifted between frames and cost
  652 KB for 8 frames. The owner compared the recordings and chose the hybrid.
- **Decision:** The rig animates everything that moves: the ride-in, every trick and every
  bail up to the cut-away on impact, as JSON clips on the in-repo runtime. Painted **held
  frames** take over after the cut: the bail aftermath, the `broken` card and the patch-up
  card are single generated images edited from the rider's master sheet, shown still with only
  a camera move. The cut-away is the seam, so the switch is never seen. Rig parts follow the
  spike's rules (joint caps painted in whatever covers the joint, separate feet, near and far
  limbs, sleeve swaps, two or three head expressions, a scale pass against the master sheet),
  and a small pose editor is milestone 4 tooling. Flipbook frames are not used for motion.
- **Alternatives:** The rig alone, rejected because its worst poses are the ones the player
  looks at longest. Flipbooks for everything, rejected for drift, ghosting and about forty
  times the size. A flipbook only for trick peaks, rejected because the switch would show
  mid-motion.
- **Consequences:** Adding a trick costs a clip, not new art. Each rider needs a master sheet,
  two or three part sheets and a handful of held frames per injury level and gore setting.
  The presentation timeline gains a held-frame beat after the cut. Codex accepted all four
  `broken` prompts but drew no bent limb or bone, so the `broken` held frames are made by
  inpainting Codex's image through ComfyUI on degenerator (DR-009's fallback), under the
  owner's own gate client. Revisit with Spine-style mesh deformation (DR-007's upgrade path)
  if playtests say the rig reads as paper.
