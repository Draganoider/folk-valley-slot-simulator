# Contributing to Folk Valley

For humans. AI agents read [`AGENTS.md`](AGENTS.md), which holds the same rules in more
detail and is worth reading here too.

## First time — set up in this order

```bash
git clone https://github.com/Draganoider/folk-valley-slot-simulator.git
```

Then install the pre-commit hook, which runs the repo's checks on every commit (it goes in
`.git/hooks/pre-commit`; `git commit --no-verify` skips it once):

```bash
python tools/ci/hygiene.py --install-hook
```

## Branches

`test` is where work lands. Commit small changes straight to it; give a major feature its
own branch off `test` and open a pull request into `test`. `main` is GitHub's default
branch, so pull requests propose it as their target: choose `test` instead
(`gh pr create --base test`). `main` only moves when the repository owner cuts a release,
by fast-forwarding it to `test` ([`docs/RELEASING.md`](docs/RELEASING.md)).

## Claiming work

Pick an issue, assign yourself, and stay inside its *Files you own* list, which is how
several people, or several agent sessions, work at once without merge conflicts. Something
outside the list needs a reason in the pull request.

## Before opening a pull request

- Typecheck, unit tests and browser tests pass: `npm run typecheck`, `npm test`, `npm run test:e2e`
- A change to the math comes with a simulation run, recorded in `docs/findings.md`
- Docs are updated in the same change, and a decision that costs more than an hour to
  reverse gets a decision record in `docs/PLAN.md`
- Every new asset has its source and license in `src/assets/provenance.json`
- No secrets, keys or `.env` contents
- No generated files
- The pull request template's checklist filled in honestly

CI runs [`tools/ci/hygiene.py`](tools/ci/hygiene.py) on every push to `test` or `main` and
on every pull request. **A red check blocks the merge** — fix it rather than merging past
it. The pre-commit hook runs the same checks on what you have staged; to run them by hand:

```bash
python tools/ci/hygiene.py
```

## Reviewing

[`REVIEWING.md`](REVIEWING.md) is the reviewer's side: the checks in order, the four finding
labels and the summary template.

## Commits

Say *why*, not just *what*. Use an imperative subject ("Add the trick ladder to the
bonus"), then a blank line and a body that says why the change was needed. This style
applies here even where a personal or global commit-style setting says otherwise. No
`Co-Authored-By` or "Generated with" lines; CI rejects them.
