# Folk Valley

A free, educational slot-machine simulator about bike, skate and scooter tricks and the
bails that come with them. Virtual credits only.

> **Status:** Pre-alpha. The repository is set up and the game mechanics are being
> researched; there is no playable build yet.

## Repository layout

| Path | Contents |
|---|---|
| `src/engine/` | *(planned)* The slot math: seeded RNG, reels, paytable, trick and bail features, RTP. Pure TypeScript (`AGENTS.md` rule 5) |
| `src/worker/` | *(planned)* The Web Worker that runs high-volume simulations |
| `src/presentation/` | *(planned)* Turns a finished spin result into a timeline of tricks, bails and wins |
| `src/renderer/` | *(planned)* The game scene; the rendering technology is decided in milestone 1 |
| `src/ui/` | *(planned)* The application UI around the scene |
| `src/assets/` | *(planned)* Shipped, compressed assets and `provenance.json`, the record of where each came from |
| `tests/` | *(planned)* Unit tests and browser tests |
| `docs/` | Everything written down that is not code — [`docs/README.md`](docs/README.md) maps it |
| `tools/ci/` | The repo's own checks, runnable locally, and the release script ([`docs/RELEASING.md`](docs/RELEASING.md)) |
| `AGENTS.md` | Rules for AI coding agents — and the shortest description of how this project works |
| `CONTRIBUTING.md`, `REVIEWING.md` | Opening a pull request, and reviewing one |

## Developing

You need Node.js 24 and Python 3.11 or newer; Python runs the repository's checks.

```bash
npm ci
```

```bash
npm run dev
```

The browser tests need a browser for Playwright: run `npx playwright install chromium`, or
set `FV_PLAYWRIGHT_CHANNEL` to one you already have (`msedge` or `chrome`).

There is no app to run yet: the scaffold arrives in milestone 3 of
[`docs/PLAN.md`](docs/PLAN.md).

Copy `.env.example` to `.env` if you need keys. `.env` is gitignored and must never be
committed.

## License

Code and documentation are under the [MIT License](LICENSE). Assets are not covered
automatically: each one's source and license are recorded beside it in
`src/assets/provenance.json` (DR-004 in [`docs/PLAN.md`](docs/PLAN.md)).
