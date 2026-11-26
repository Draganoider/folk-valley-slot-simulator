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
