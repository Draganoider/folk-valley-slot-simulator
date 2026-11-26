# `src/renderer/` — the reel scene

PixiJS 8 ([`docs/PLAN.md`](../../docs/PLAN.md), DR-007), mounted by
[`src/ui/SceneHost.tsx`](../ui/SceneHost.tsx) into a div; React never renders Pixi objects.
Placeholder art only: each symbol is a coloured, labelled rectangle until milestone 4.

| File | Owns |
|---|---|
| [`scene.ts`](scene.ts) | The `Scene` interface, `SceneSnapshot`, and `createNullScene` for when WebGL cannot start |
| [`frame.ts`](frame.ts) | `SceneFrame`, what one grid shows, read from a finished `SpinResult`: `baseFrame`, `sessionFrame`, `framesOf` |
| [`pixi-scene.ts`](pixi-scene.ts) | `PixiScene`: the 5×3 grid, caption and Scar Card meter |
| [`placeholder-symbols.ts`](placeholder-symbols.ts) | The colour and label of each symbol |

## The interface

```ts
interface Scene {
  show(frame: SceneFrame, options: { reducedMotion: boolean }): Promise<void>;
  setScarCard(marks: number, size: number): void;
  snapshot(): SceneSnapshot; // read-only, for the UI and the browser tests
  destroy(): void;
}
```

The scene never sees a `SpinResult`, only `SceneFrame`s: the grid and stops, the Kicker a trick
launched from, the reels a landing turned wild, the winning positions, the Flyers, the Scar Card
before and after, and a caption. Nothing flows back, so the scene cannot change an outcome
(AGENTS.md rule 4). A paid spin with a Session is one base frame and then one frame per free
spin.

`show` stops the reels left to right, turns a landing's reels to WILD, then outlines every
winning position, dims the rest and moves the meter from `before` to `after`. Its pauses are
plain timers, about 0.8 s a frame; with `reducedMotion` it draws the end state at once. This is
deliberately minimal: the presentation timeline in `src/presentation/` will drive the scene on
its own clock, and these pauses go when it does.

Settings follow [`docs/research/rendering.md`](../../docs/research/rendering.md): WebGL
preferred, resolution `min(devicePixelRatio, 2)`, a fixed 960 × 600 stage scaled by CSS, and
the canvas `aria-hidden` because the DOM carries every label.

`frame.ts` is pure and tested in Node (`tests/renderer/`); the Pixi scene is covered by the
browser tests through its snapshot.
