# Reviewing a pull request

For everyone who reviews here, teammates and AI agents alike. [`CONTRIBUTING.md`](CONTRIBUTING.md)
is the author's side of a pull request; this is the reviewer's.

A review answers two questions. For the author: **what has to change before this merges,
and why?** For the team: **what did the reviewer actually check?** CI answers neither: it
runs the repo's hygiene checks, so a green check is compatible with code that does not
build.

## Check, in this order

The early steps are the cheapest, and they catch the most expensive problems.

```bash
gh pr checkout <number>
```

1. **Read the issue before the diff.** Note its *Files you own* and its *Definition of
   done*. You are checking the pull request against those, not against its own description.
   A request in an issue comment is part of the spec.
2. **Compare the changed files with *Files you own*.** Every file outside the list needs a
   reason in the description.

   ```bash
   git diff --stat origin/test...HEAD
   ```

3. **Run the hygiene checks** if CI has not finished: `python tools/ci/hygiene.py --base origin/test`.

4. **Build it and run the tests.** `npm ci`, then `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e`. Until the app is scaffolded in milestone 3 there is nothing to build, and `python tools/ci/hygiene.py` is the whole check. **If you cannot do this step, say so
   in the review.** That includes an AI agent that cannot run the toolchain. A review that
   did not build the code is still worth having, as long as it does not imply otherwise.
5. **Hold the code against the Definition of done.** For each item: done, partly done, not
   done, or done differently. Done differently is fine when the description says so and
   why; a silent one is a finding.
6. **Read the tests as if the code were wrong.** Would each test fail if the behaviour its
   name promises broke? A test that only constructs an object tests nothing.
7. **Check the rules in [`AGENTS.md`](AGENTS.md) that CI cannot.**
8. **Check the paperwork.** The description matches the diff. `Closes #n` only when every
   Definition-of-done item is met; otherwise `Part of #n`, so the release does not close
   unfinished work. (The merge commit carries the description, and GitHub closes the issue
   when that commit reaches `main` in a release.) If the commit messages do not say why, ask
   the author to reword them before merging; pull requests merge with a merge commit, so
   every commit message stays in the history.

A pull request that changes only docs skips steps 4 to 7; say so under *How I reviewed*.

## Label every finding

| Label | Use it for | The author |
|---|---|---|
| **Blocking** | Anything that must change before merge | fixes it, or changes your mind |
| **Should fix** | Worth doing in this pull request | fixes it, or opens an issue and links it |
| **Nit** | Taste, typos, small tidy-ups | may ignore it without replying |
| **Question** | Something you do not know | answers before merge |

**Blocking** is for code that does not build or fails a test, a broken hard rule, a
Definition-of-done item missing with no reason given, or a description that claims work the
diff does not contain. Write every finding as **where**, **what**, **why it matters** and
**a fix** when you have one. Comment on the code, never the person.

## Write the summary

Paste this into the summary box under *Review changes*. Delete any empty section except
*Verdict* and *How I reviewed*. Every **Blocking** and **Should fix** item goes in it in full,
even one you also left inline.

```markdown
**Verdict: <Approve | Changes requested | Needs a decision from @who>.** <The main reason, in one sentence.>

### What works
- <Specific: what should survive the rework, and why it is right.>

### Blocking
1. **<Short title>** — `<path>:<line>`
   <What is wrong.> <Why it matters.> <Suggested fix.>

### Should fix
1. **<Short title>** — `<path>:<line>`
   <What, why, fix.>

### Nits
- `<path>:<line>` — <one line each>

### Questions
- <What you need to know, and why the verdict depends on it.>

### Definition of done (#<issue>)
| Item | Status | Note |
|---|---|---|
| <copied from the issue> | Done / Partly / Not done / Done differently | |

### How I reviewed
- Issue #<n> read. Changed files against *Files you own*: <n owned, n others, all explained / list>
- Hygiene checks: <passed / list>
- Built and tested: <result>, or **not built**, because <reason>
```

Posting a review an agent drafted makes it yours. Read it, and check its blocking claims,
before it goes out under your name.

## When the author pushes again

Review only what changed (*Files changed → Changes since your last review*), resolve the
threads you opened once they are fixed, and update your verdict. A stale *Request changes*
tells everyone the pull request is still broken.
