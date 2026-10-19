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
| 3 | Playable prototype | The app scaffold with placeholder art: spin, trick and bail presentation, the statistics panel, and CI that builds and runs the unit and browser tests | |
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
  merge commit that carries the description. Both branches require the *Hygiene checks*
  status check and refuse force-pushes and deletion; no review is required, because a sole
  owner cannot approve their own pull requests.
- **Alternatives:** `test` as the default branch, which would make pull requests target it
  automatically and close issues on merge; declined in favour of `main` showing the released
  state. Merging `test` into `main` through a pull request, rejected because each one adds a
  merge commit that exists only on `main`, so the branches drift apart.
- **Consequences:** Every pull request must choose `test` as its base (`--base test`).
  Issues close when their work reaches `main` in a release, not when it merges into `test`.
  Issue forms and the pull request template are read from `main`, so changes to them appear
  after the next release.

### DR-003 — Injuries are realistic but limited

- **Status:** accepted, 2026-10-18
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
