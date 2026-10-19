# `.claude/` — Claude Code configuration

Everything in here is project-scoped and shared with the team. Claude Code reads it when a
session starts in this repository.

| Path | Committed | Purpose |
|---|---|---|
| `settings.json` | yes | Team-wide settings. Applies to everyone. |
| `settings.local.json` | **no** (gitignored) | Personal overrides: machine-specific paths and personal preferences. |

Settings load in order **user → project → local**, so `settings.local.json` overrides
`settings.json`, which overrides your personal `~/.claude/settings.json`.

## Where the rules actually live

Not here, and not in `CLAUDE.md` either. **[`AGENTS.md`](../AGENTS.md) at the repository
root is the single source of truth** for every AI agent. [`CLAUDE.md`](../CLAUDE.md) is a
thin file whose first line, `@AGENTS.md`, imports it.

| Layer | File | Holds |
|---|---|---|
| Rules | `AGENTS.md` | Everything an agent must know or do. **Edit this one.** |
| Adapter | `CLAUDE.md` | The `@AGENTS.md` import, plus Claude-only notes |
| Configuration | `.claude/settings.json` | How the tool behaves, not what it should do |

## Current settings

`attribution.commit` and `attribution.pr` are empty strings, which removes the
`Co-Authored-By` trailer from commits and the "Generated with Claude Code" line from pull
request descriptions. The history should read as the team's work.

## Permissions

**`deny` keeps `.env` files out of reach.** Claude Code's Read tool refuses `.env` and
`.env.local` at any depth. This backs the secrets rule with a setting rather than only a
sentence. It covers the Read tool, not a shell command such as `cat`, so the rule in
`AGENTS.md` still applies; `.env.example` stays readable, because it holds no secrets.

**`allow` skips the approval prompt for commands that only read**: status, diffs, logs,
pull requests and issues, `tools/ci/hygiene.py`, and `tools/ci/release.py check` and
`notes`. Anything that commits, pushes, merges
or posts still asks first. Add personal allowances to `settings.local.json`, not here.
