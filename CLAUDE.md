@AGENTS.md

# Claude Code — project notes

The line above imports [`AGENTS.md`](AGENTS.md), which holds **all** the project rules and
is shared with every other AI agent used here (Codex, Cursor, Copilot, and so on).

**Add project rules to `AGENTS.md`, not to this file.** Anything written only here is
invisible to every other agent, and the two files drift apart silently.

This file exists because Claude Code loads `CLAUDE.md` rather than `AGENTS.md`. Only
Claude-specific configuration notes belong below.

## Claude-specific configuration

Tool configuration lives in [`.claude/`](.claude/README.md):

- `.claude/settings.json` — committed, team-wide. Sets `attribution.commit` and
  `attribution.pr` to empty strings, which is how the no-attribution rule is enforced for
  Claude Code specifically; other agents honour it by convention, and CI checks it.
  Its `permissions` deny reading any `.env` and let read-only git, `gh`, hygiene-check and
  release-check commands run without a prompt.
- `.claude/settings.local.json` — gitignored, personal overrides.
