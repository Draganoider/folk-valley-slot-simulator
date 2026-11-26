# `src/ui/` — the app around the scene

React 19 + TypeScript, built with Vite ([`docs/PLAN.md`](../../docs/PLAN.md), DR-007). It owns
the player's game, the controls and the text that describes every spin; the reels are drawn by
[`src/renderer/`](../renderer/README.md). `npm run dev` serves it, `npm run build` builds it to
`dist/`, `npm run preview` serves the build.

| File | Owns |
|---|---|
| [`main.tsx`](main.tsx) | The entry point `index.html` loads |
| [`App.tsx`](App.tsx) | The page: balance, bet, Spin, reset credits, seed, gore setting, Scar Card meter, the last spin in text |
| [`SceneHost.tsx`](SceneHost.tsx) | Mounts the PixiJS scene imperatively into a div; falls back to text only when WebGL cannot start |
| [`use-reduced-motion.ts`](use-reduced-motion.ts) | Follows `prefers-reduced-motion` |
| [`game/game.ts`](game/game.ts) | `GameState` (balance, bet, seed, spin index, the engine's `PlayerState`), `playSpin`, saving and loading |
| [`game/prefs.ts`](game/prefs.ts) | The gore setting, Full by default (DR-009) |
| [`game/storage.ts`](game/storage.ts) | Every `localStorage` access, each in try/catch |
| [`game/describe.ts`](game/describe.ts) | Text for wins, tricks, bails, the Session and the meter |

`game/` uses no DOM or React, so `tests/ui/` tests it in Node.

## Rules it keeps

- **Virtual credits only** (AGENTS.md rule 3). The balance is a number in `GameState`; "Reset
  credits" refills it to 10,000. Nothing on the page offers to buy, sell or cash out anything.
- **One `spin()` per paid spin, decided first** (rule 4). `playSpin` calls the engine once, and
  the new state, with the cost, the win and the new Scar Card, is saved before the scene shows
  anything. The scene only receives frames read from the finished result. The balance on
  screen drops by the cost at once and shows the win when the scene has finished; a reload
  mid-spin shows the saved balance with the win already in it.
- **Saved in the browser** (DR-010). The balance, bet, seed, spin index and every bet level's
  Scar Card are one record, `folk-valley.game.v1`, so they never save out of step. A record
  that does not fit the configuration is discarded whole, not repaired. The gore setting is
  `folk-valley.prefs.v1`. With storage blocked the game plays on and says it is not saving.
- **Seeds.** 16 hex digits are used as they are; other text goes through the engine's
  `seedFromText`. A new seed starts again from spin 1; the balance and cards are kept. A first
  visit gets a random seed.
- **Gore** (DR-009) only changes text and, later, art: Mild shows `broken` as the patched-up
  card and hides blood. The engine never sees it.

## Accessibility

Space or Enter spins from anywhere that is not a control (controls keep their own keys); every
control shows a focus ring; the canvas is `aria-hidden` and every win, trick, bail, Session spin
and the Scar Card meter have text; a polite live region announces each spin's outcome; under
`prefers-reduced-motion` the scene draws each end state at once.

## Browser tests

`npm run test:e2e` runs [`tests/e2e/`](../../tests/e2e/) with Playwright against a production
build served on port 4317. Set `FV_PLAYWRIGHT_CHANNEL` in `.env` (see `.env.example`) to use an
installed Edge or Chrome instead of downloading Chromium. The tests compute every expected
figure by calling the engine with the same seed, and read the scene through
`window.__fv.scene()`, a read-only snapshot that cannot start or change a spin.

The presentation timeline (`src/presentation/`) is not wired in yet; until it is, `App.tsx`
shows each frame of a result in turn with the scene's own short pauses.
