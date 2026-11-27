# `src/renderer/` — the reel scene

PixiJS 8 ([`docs/PLAN.md`](../../docs/PLAN.md), DR-007), mounted by
[`src/ui/SceneHost.tsx`](../ui/SceneHost.tsx) into a div; React never renders Pixi objects.
Placeholder art only: symbols are coloured, labelled rectangles, the rider is a box-and-circle
figure and every card is a labelled panel until milestone 4.

| File | Owns |
|---|---|
| [`view.ts`](view.ts) | `viewAt(timeline, t)`: the pure, time-indexed `SceneView` the scene draws |
| [`scene.ts`](scene.ts) | The `Scene` interface, `SceneSnapshot`, `SceneRecorder`, and `createNullScene` for when WebGL cannot start |
| [`pixi-scene.ts`](pixi-scene.ts) | `PixiScene`: the 5×3 grid, caption, Session bar, win line and meter, Scar Card meter, flash |
| [`placeholder-rider.ts`](placeholder-rider.ts) | `RiderLayer` and its placeholder figure: the seam for DR-015's rig clips |
| [`placeholder-card.ts`](placeholder-card.ts) | `CardLayer` and its placeholder panel: the seam for DR-015's painted held frames |
| [`placeholder-symbols.ts`](placeholder-symbols.ts) | The colour and label of each symbol, and the labels a spinning reel scrolls through |

## How a spin is drawn

The app builds the spin's timeline (`src/presentation/`, DR-014) and plays it with a
`TimelinePlayer` on `requestAnimationFrame`. Each frame it calls
`scene.render(viewAt(timeline, frame.time))`. The scene runs no timers or tweens of its own:
every reel offset, rider position, fade and flash is computed in `viewAt` from how far through
its event `t` is. So turbo (a player speed), skip (a seek to the end) and any seek draw exactly
what playing to that time would, and the last view equals the timeline's `final` state.

```ts
interface Scene {
  begin(): void;                 // a new timeline starts: forget what the last one showed
  render(view: SceneView): void; // draw one moment
  setScarCard(marks: number, size: number): void; // outside a timeline: bet change, reload
  snapshot(): SceneSnapshot;     // read-only, for the UI and the browser tests
  destroy(): void;
}
```

Nothing flows back from the scene, so it cannot change an outcome (AGENTS.md rule 4).
`viewAt` only copies what the events say and adds positions and fades.

What each event looks like, as placeholders for now:

| Events | Drawn as |
|---|---|
| `reels-spin-up`, `reel-stop` | Labels scrolling in each column, then each reel drops into place, left to right |
| `trick-approach`, `trick`, `trick-land` | The rider rolls to the ramp at the Kicker's reel (the middle in the Session), jumps with a spin and the trick's name, lands with "LANDED!" |
| `wild-reels` | The Kicker's reel, then the others, turn WILD one after another |
| `bail-impact` | The rider falls; at contact (`BAIL_CUT_AT`) the scene cuts to a white flash and the rider is never drawn hitting the ground |
| `injury`, `patch-up` | A card at the level (SCUFFED, BLEEDING, BROKEN), then PATCHED UP. Blood marks only when `bloodHidden` is false; under gore Mild there is no `broken` event, and the patch-up says it was a bad one |
| `win-highlight`, `spin-win` | That win's positions outlined, with its line and amount in credits; then every win of the spin stays outlined, and a WIN card |
| `scar-card` | A card (+1, FULL, HOLDS) and the meter outlined |
| Session events | Cards for the trigger, intro, each free spin, climb and pain; a Session bar with the multiplier, rung, pain and spins left |
| `closing-card` | The patched-up card inside a phone frame, "● REC · friend filming" (DR-010) |
| `session-total`, `count-up` | A total card, then the win meter counting up |

Under reduced motion the timeline's motion beats are short, and the view has no flash, no
scrolling, no settle drop and no jump arc: poses fade in place.

## Milestone 4 seams (DR-015)

- **Rig clips.** `RiderView.clip` names the clip (`approach`, the trick id, `land`, the bail's
  `animationId`) and its progress, 0 to 1. A rig layer implements `RiderLayer` and plays it;
  nothing else changes.
- **Held frames.** `CardView.heldFrame` names the still to show after the cut (rider, level,
  injury id, `bloodHidden`). A held-frame layer implements `CardLayer` and shows the painting,
  with only a camera move, for every card that has one; the others keep a plain panel.

## Snapshot

`snapshot()` reports the phase (`idle`, `playing`, `shown`), how many reels have stopped, the
last `SceneView` drawn, and `cardsSeen`, every card shown since `begin()` as `kind` or
`kind:level`. The browser tests read it through `window.__fv.scene()`.

Settings follow [`docs/research/rendering.md`](../../docs/research/rendering.md): WebGL
preferred, resolution `min(devicePixelRatio, 2)`, a fixed 960 × 600 stage scaled by CSS, and
the canvas `aria-hidden` because the DOM carries every label.

`view.ts` is pure and tested in Node (`tests/renderer/view.test.ts`); the Pixi scene is covered
by the browser tests through its snapshot.
