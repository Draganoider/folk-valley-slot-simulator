# Releasing

A release is a tagged version of Folk Valley with its changelog section as the notes.

## When, and which number

- **A release closes a milestone: the next minor version when the milestone's definition
  of done in [`PLAN.md`](PLAN.md) is met.** Milestone 1 releases `0.1.0`, milestone 2
  `0.2.0`, and so on.
- **A patch release** (`0.2.1`) fixes a bug in a released version without new features.
- **While the version is `0.x`, anything may change in any release.** `1.0.0` is the first
  version that promises it will not.

The version is [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the tag is the
version with `v` in front: `v0.2.0`.

## How

Releases are cut from `main`, and only the repository owner releases. `main` never gets
commits of its own: it only moves by fast-forwarding to `test`, so every release is exactly
a state that was on `test` and passed CI there (DR-002 in [`PLAN.md`](PLAN.md)).

1. **Prepare the version on `test`:**

   ```bash
   python tools/ci/release.py prepare 0.2.0
   ```

   It changes the version in every file `tools/ci/config.json` lists, and moves the
   changelog's `[Unreleased]` entries under `## [0.2.0] - <today>`, leaving an empty
   `[Unreleased]` above them. Read the section as a user would, since it becomes the release
   notes. Commit it to `test`, push, and wait for CI to pass there.
2. **Fast-forward `main` to `test`:**

   ```bash
   git fetch origin
   ```

   ```bash
   git push origin origin/test:refs/heads/main
   ```

   Git refuses the push unless it is a fast-forward, which is the point: if `main` has a
   commit `test` does not, stop and find out why rather than forcing it. This is also when
   GitHub closes the issues that the release's commits and merge commits say they close.
3. **Tag `main` and push the tag:**

   ```bash
   git tag -a v0.2.0 origin/main -m "Folk Valley 0.2.0"
   ```

   ```bash
   python tools/ci/release.py check v0.2.0
   ```

   ```bash
   git push origin v0.2.0
   ```

4. **The `Release` workflow publishes it.** It repeats the check and creates the GitHub
   release with the changelog section as its notes
   (`python tools/ci/release.py notes v0.2.0` shows them beforehand).

If the workflow fails, nothing was published. Fix the cause on `test`, fast-forward `main`
again, then move the tag: `git push origin :refs/tags/v0.2.0`, tag again, and push again.
Never move a tag after its release is published; cut a patch release instead.

## Between releases

The version files stay at the last release, and new entries go under `[Unreleased]`. The
hygiene check `version` fails a pull request in which the version files disagree, or whose
version has no dated changelog section.
