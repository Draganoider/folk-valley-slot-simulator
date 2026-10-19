# Folk Valley — instructions for AI coding agents

A free, educational slot-machine simulator about bike, skate and scooter tricks and the
bails that come with them. Virtual credits only.

> **This file is the single source of truth for every AI agent working in this
> repository** — Codex, Claude Code, Cursor, Copilot, Gemini CLI, Aider, and others.
> Agent-specific files (`CLAUDE.md`, `.github/copilot-instructions.md`) are thin pointers
> to this one. **Put rules here, not in those.**
>
> Humans should read it too — it is the shortest description of how this project works.

## Read this first

**Before doing any work, read [`docs/PLAN.md`](docs/PLAN.md).** It is the plan of record:
architecture, milestones with definitions of done, and decision records explaining *why* things
are the way they are, so they are not relitigated from memory.

New measurements and lessons go in [`docs/findings.md`](docs/findings.md) the day they are
taken, negative results included.

## Hard rules

1. **Never commit secrets.** `.env` holds keys and is gitignored; `.env.example` is the
   committed template. Keys go in HTTP headers, never URLs, and are redacted from error
   output.
2. **No attribution trailers in commits or pull requests.** No `Co-Authored-By`, no
   "Generated with &lt;tool&gt;". The history should read as the team's work; authorship is
   already recorded by the committer field. CI checks this.
3. **Virtual credits only.** No deposits, withdrawals, purchases, cash-out, cryptocurrency,
   real-money integrations or claims of financial return. Anything that touches real value
   turns an educational simulator into gambling.
4. **The engine decides every spin before anything is shown.** That includes every trick
   attempt and whether it lands or bails. Animation shows a result but never decides or
   changes it, and RTP comes only from the reel strips, the feature probabilities and the
   paytable; never adjust a result after the spin to hit a target. Otherwise what the player
   sees and what the math says can disagree.
5. **The engine is pure, seeded TypeScript.** It depends on no UI framework, renderer,
   browser global, audio or animation code, and with the same seed it produces the same
   results. Unit tests cover payout evaluation, seeded reproducibility, configuration
   validation and RTP. High-volume simulations run in a Web Worker. This keeps the math
   testable on its own and the page responsive while a million spins run.
6. **Statistics are labelled honestly.** Simulated figures say they are simulated, and
   theoretical values are kept apart from observed ones, so nobody is misled about the odds.
7. **Original assets only.** Every committed asset is made for this repository or covered by
   a documented compatible license, and its source and license are recorded in
   `src/assets/provenance.json` (CI checks this). No real riders, no real bike, skate,
   scooter or energy-drink brands, no logos, and no real fail-video footage. The repository
   is public.
8. **Injuries are realistic but limited.** Scrapes, road rash, bruises, swelling, bleeding
   cuts, nosebleeds, split lips, a knocked-out tooth, casts, slings and neck braces are in.
   Exposed bone, open fractures, deep wounds, gore, heavy blood spray, dismemberment, and
   death or permanent injury played for laughs are out. Riders are adults, and every bail
   ends with the rider patched up and okay. A Folk Valley moment is a wince, not a tragedy;
   past that line the joke stops working.
9. **Sessions share the workspace.** Several Claude Code sessions may work in this checkout
   at once. Read a file before editing it, edit only what your task covers, and never revert
   or reformat changes you did not make; report a needed change outside your task instead of
   making it silently.

## Repo layout

| Path | Contents |
|---|---|
| `src/engine/` | *(planned)* The slot math: seeded RNG, reels, paytable, trick and bail features, RTP. Pure TypeScript (rule 5) |
| `src/worker/` | *(planned)* The Web Worker that runs high-volume simulations |
| `src/presentation/` | *(planned)* Turns a finished spin result into a timeline of tricks, bails and wins |
| `src/renderer/` | *(planned)* The game scene; the rendering technology is decided in milestone 1 |
| `src/ui/` | *(planned)* The application UI around the scene |
| `src/assets/` | *(planned)* Shipped, compressed assets and `provenance.json`, the record of where each came from |
| `tests/` | *(planned)* Unit tests and browser tests |
| `docs/` | Everything written down that is not code — [`docs/README.md`](docs/README.md) maps it |
| `tools/ci/` | `hygiene.py`, every check CI runs, runnable on your machine; `release.py`, the mechanical steps of a release |

## Working conventions

**Branches.** `test` is where work happens. Small changes are committed straight to
`test`; a major feature gets its own branch off `test` and a pull request **into `test`**.
`main` is GitHub's default branch and the release branch, so GitHub proposes it as every
pull request's target: pass `--base test` to `gh pr create`, and check the base in the web
UI. Never commit to `main` or open a pull request into it.

**Releases** are tags on `main`, published by the `Release` workflow;
[`docs/RELEASING.md`](docs/RELEASING.md) is the process. `main` only moves when a release is
cut, by fast-forwarding it to `test`, so it is always a state that was tested. Never change
the version by hand: `tools/ci/release.py prepare` moves every version file and the
changelog together, and CI fails them disagreeing. Never push to `main` or push a tag unless
the repository owner asked for that release.

**Commits.** Explain *why*, not just *what*. Use an imperative subject ("Add the trick
ladder to the bonus"), then a blank line and a body that says why the change was needed.
This style applies here even where a personal or global commit-style setting says
otherwise. No attribution trailers (rule 2).

**Before opening a pull request:**
- Typecheck, unit tests and browser tests pass: `npm run typecheck`, `npm test`, `npm run test:e2e`
- A change to the math comes with a simulation run, recorded in `docs/findings.md`
- Docs are updated in the same change, and a decision that costs more than an hour to
  reverse gets a decision record in `docs/PLAN.md`
- Every new asset has its source and license in `src/assets/provenance.json`
- No secrets and no generated files
- `python tools/ci/hygiene.py` passes

**Never merge a pull request with a failing CI check.** `Repo hygiene` runs
[`tools/ci/hygiene.py`](tools/ci/hygiene.py), which says what each check catches and why;
run it before committing, on what is staged. A red check is a blocker, not a warning. A rule
in this file that a script can check belongs there too ([`tools/ci/README.md`](tools/ci/README.md)).

**Reviewing a pull request** follows [`REVIEWING.md`](REVIEWING.md): the checks in order,
the four finding labels, and the summary template. A green check is not a review. An agent
that could not build or test the change says so in the review rather than implying it
works.

**Scratch work goes in `.scratch/<topic>/`** at the repository root: experiment scripts,
renders, downloads, logs, drafts. Git ignores the folder, so it stays with the checkout
where the user can find it, never in a tracked folder or a system temp directory. Give each
topic a short `README.md` saying what is there. Anything worth keeping moves into the
repository proper.

## Current state

Set up on 2026-10-18 with no game code yet; the `src/` folders in the layout are planned,
not created. Milestone 1, game design research (mechanics, math targets, rendering and
animation approach, art direction), is next. Until it closes, no framework or renderer is
decided.

What has merged and what is still to do are in [`docs/STATUS.md`](docs/STATUS.md). It is not
loaded into every session, which is why it is not here. When work lands on `test`, update
`docs/STATUS.md`, and this section only when a milestone opens or closes.

## Agent-specific configuration

Behavioural rules belong in this file. Only tool-specific *configuration* belongs in the
files below.

| Agent | Entry point | Notes |
|---|---|---|
| Claude Code | [`CLAUDE.md`](CLAUDE.md) → imports this file | Settings in [`.claude/`](.claude/README.md) |
| Codex, Cursor, Copilot, Gemini CLI, Aider, Zed, Windsurf, Devin | **this file**, natively | |

If you add an agent that reads a different filename, create a **pointer** to this file
rather than a copy. Duplicated rule files drift apart, and the drift is invisible until
two agents behave differently for reasons nobody can explain.

Skills follow the same rule. Each lives once, in `.agents/skills/<name>/`, where Codex reads
it; Claude Code reads `.claude/skills/`, so each skill there is a pointer `SKILL.md` with the
same name and description that sends Claude Code to the one in `.agents/skills/`. Use plain
files, not symlinks: git checks symlinks out as text on many Windows machines.
