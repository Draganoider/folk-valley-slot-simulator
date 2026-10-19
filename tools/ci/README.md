# `tools/ci/` — the repo's own checks

| File | What it does |
|---|---|
| `hygiene.py` | Every check CI runs, runnable on your machine: `python tools/ci/hygiene.py` checks what you have staged, `--list` names the checks, `--install-hook` runs them before every commit |
| `release.py` | The mechanical steps of a release: `prepare`, `check`, `notes` ([`docs/RELEASING.md`](../../docs/RELEASING.md)) |
| `config.json` | What differs between projects |

The scripts use the Python standard library only, so they run anywhere Python 3.11+ does.

## `config.json`

| Key | Meaning |
|---|---|
| `integration_branch` | The branch pull requests target. A local run compares against where `HEAD` left `origin/<this>` |
| `forbidden` | Extra files that must never be tracked: `[{"pattern": "dist/**", "message": "Build output is committed."}]`. `.env` is always forbidden, and so are Unity's generated folders when there is a Unity project |
| `python.paths` | Folders whose `.py` files must compile. `[]` turns the check off |
| `python.stdlib_only` | Those scripts import only the standard library and their sibling modules |
| `python.extra_imports` | A folder's allowed third-party modules: `{"tools/art/": ["numpy"]}`. Say so in that folder's README too |
| `key_in_url_globs` | Files searched for an API key in a URL |
| `html_link_dirs` | Folders whose `.html` files have their relative links checked, beside every `.md` |
| `attribution_tools` | Tool names a "Generated with ..." line is matched against |
| `unity_version` | The pinned Unity version. Without it, the version most Unity projects use is the pin |
| `assets.binary_types` | The only binary file types that may be committed: compressed web formats. Anything else, a PSD or a raw WAV, stays in the ignored `art-source/` folder |
| `assets.max_bytes` | The largest a committed binary may be. Without Git LFS, every binary stays in every clone forever (DR-001 in [`docs/PLAN.md`](../../docs/PLAN.md)) |
| `assets.dir`, `assets.manifest` | The shipped-assets folder, and the provenance manifest every file in it must be listed in |
| `release` | `null` when the repo does not release. Otherwise `branch`, `tag_prefix`, `changelog`, `version_files` (each `{"path", "pattern"}`, the pattern's first group being the version) and an optional `install_note`, where `{tag}` and `{version}` are filled in |

## The provenance manifest

Hard rule 7 in [`AGENTS.md`](../../AGENTS.md) says every asset is original or under a
documented compatible license. The `provenance` check holds the repo to it: every file under
`src/assets/`, apart from Markdown notes, needs an entry in `src/assets/provenance.json`,
keyed by its path relative to that file, with at least a `source` and a `license`. An entry
for a file that is not tracked fails too, so the record stays true when assets move.

```json
{
  "assets": {
    "symbols/helmet.webp": {
      "source": "Generated for this repository with OpenAI image generation through Codex, then edited and compressed by hand",
      "license": "Original to this repository, MIT (DR-004)"
    }
  }
}
```

Other fields, such as `author`, `date` or `notes`, are allowed and ignored by the check.
The manifest is created with the first asset; until then the check passes because there is
nothing to record.

## Adding a check

A rule a script can check belongs here rather than only in prose. Add a function under
`PROJECT CHECKS` in `hygiene.py` that prints an `OK:` line and returns `True` when it passes,
calls `error()` for each problem and returns `False` otherwise. Give it a one-line docstring
summary, add it to `CHECKS`, and give it a step in `.github/workflows/repo-hygiene.yml`.
Then break the rule on purpose once and see the check fail.
