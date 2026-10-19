## What this changes

<!-- One or two sentences. What and why, not how. -->

## Issue

<!-- "Closes #n" only when every Definition-of-done item is met; otherwise "Part of #n". -->

## Checks

- [ ] Typecheck, unit tests and browser tests pass (`npm run typecheck`, `npm test`, `npm run test:e2e`)
- [ ] A math change comes with a simulation run in `docs/findings.md`
- [ ] Docs updated in the same change; a decision record in `docs/PLAN.md` if it is costly to reverse
- [ ] Every new asset recorded in `src/assets/provenance.json`
- [ ] Injury content stays within hard rule 8 of `AGENTS.md`
- [ ] No secrets, keys or `.env` contents included
- [ ] No generated files committed
- [ ] `python tools/ci/hygiene.py` passes

## Notes for the reviewer

<!-- Anything you're unsure about, or want a second opinion on. -->

---

Reviewing this? [`REVIEWING.md`](https://github.com/Draganoider/folk-valley-slot-simulator/blob/test/REVIEWING.md) has the checks, in order, and the summary template.
