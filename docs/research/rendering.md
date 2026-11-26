# Research: rendering, animation and app stack

Milestone 1 research input for the rendering and animation decision record
([`PLAN.md`](../PLAN.md), milestone 1). Written 2026-11-25. Versions and licenses were
checked that day with `npm view` and on the vendors' pages; sources are linked inline and
listed at the end. A recommendation here is not a decision until the lead session turns the
proposed record at the bottom into an accepted one in `PLAN.md`.

## Summary

| Question | Recommendation | Fallback |
|---|---|---|
| Renderer | **PixiJS 8** (WebGL, MIT) | Phaser 4 if we later want its scene, input and tween systems; Pixi's Canvas2D renderer for devices without WebGL |
| UI and build | **React 19 + TypeScript + Vite 8**, Pixi mounted imperatively, not through a React reconciler | Preact 11 (with `preact/compat`) if the UI's 69 KB gzipped matters |
| Rider animation | **Cut-out puppet rigs** from separately generated part images, driven by an in-repo TypeScript rig and keyframe clips; bails use ragdoll motion **baked offline** into clips | **Key-pose flipbooks**: 4 to 8 generated poses per trick or bail, edited from one reference image, tweened and motion-blurred in Pixi |
| Timeline | A pure `present(result) → Timeline` in `src/presentation/`, played by a seekable player on an injectable clock; skip and turbo are seeks and time scales | |
| Test strategy | Unit-test the timeline in Node; in the browser, drive a manual clock through a test hook and assert timeline state, not frames | Playwright's `page.clock` where the hook cannot reach |
| Assets | WebP texture atlases at most 2048 × 2048, one rider per atlas, AVIF only where it measurably saves more | |

## Constraints this has to satisfy

From [`AGENTS.md`](../../AGENTS.md) and [`PLAN.md`](../PLAN.md):

- The engine decides the whole spin, every trick attempt and every bail included, before
  anything is shown (rule 4). So animation is pure *display*: it may never feed back into a
  result, and nothing in the renderer may need randomness that the result does not already
  carry.
- The engine is pure, seeded TypeScript with no renderer dependency (rule 5). The renderer
  choice therefore only constrains `src/renderer/` and `src/ui/`, and is reversible at the
  cost of rewriting those.
- Assets are committed only as WebP, AVIF, PNG, OGG, M4A or WOFF2, at most 1 MB each
  (DR-001). **Video formats (WebM, MP4, MOV) are not on that list**, which matters for the
  animation options below.
- Art arrives as static PNGs from OpenAI image generation through Codex. That generator is
  good at a single realistic image and at editing one image into a variant, and poor at a
  consistent multi-frame sprite sheet: the same rider drifts in face, kit and proportions
  from frame to frame.
- Injuries stay inside rule 8, and every bail ends with the rider okay.

## 1. Renderer

Sizes are minified and gzipped. The Pixi figure was measured with esbuild for a minimal
import (`Application`, `Sprite`, `Container`, `Assets`), so it is what a real build pays;
the others are [Bundlephobia](https://bundlephobia.com/)'s whole-package figures.

| | PixiJS | Phaser | Three.js | Plain Canvas 2D / DOM |
|---|---|---|---|---|
| Version, license | 8.23.0, MIT | 4.2.1, MIT (4.0.0 published 2026-04-10) | 0.187.0, MIT | built in |
| Size (gzip) | ~177 KB measured minimal; 282 KB whole package | 356 KB whole package | 186 KB whole package | 0 |
| What it is | A 2D renderer: scene graph, batching, filters, meshes, asset loader | A full game framework built on its own renderer: scenes, input, tweens, physics, audio | A 3D renderer | The browser's own APIs |
| Realistic 2D / 2.5D | Strong. Filters (blur, displacement, colour), blend modes, and `MeshPlane`, `MeshRope` and `PerspectiveMesh` for bending a texture, which is what a cut-out limb or a cloth flap needs ([meshes](https://pixijs.com/8.x/guides/components/scene-objects/mesh)) | Strong, about the same as Pixi | Strongest lighting and depth, but realistic 3D riders need 3D models, which our image pipeline cannot make. Textured planes in 3D (2.5D parallax) are possible, but Pixi does that well enough | Weak: no batching, no shaders, so filters and deformation are slow or absent |
| Animation tooling | Official Spine runtime (`@esotericsoftware/spine-pixi-v8`), Rive and Lottie can composite with it; works with any tween library | Built-in tweens and timelines, Spine plugin | Its own animation system for 3D models | Hand-written |
| Mobile performance | Good: WebGL batching; WebGPU optional; a Canvas2D fallback with fewer features ([application](https://pixijs.com/8.x/guides/components/application)) | Good, similar engine | Good for simple scenes, heavier for many textured planes | Fine for UI, poor for a busy animated scene |
| Testability | Scene graph is plain objects you can inspect; its ticker can be stopped and `render()` called by hand, so a test controls time | Owns the game loop and scene lifecycle, so a test has to work around the framework to control time | Similar to Pixi | Best (DOM), but only for the UI |
| Fit with an external timeline | Good: Pixi is a renderer, so our timeline stays in charge | Awkward: Phaser wants to own the loop, the scenes and the tweens, and we would use a fraction of it while fighting the rest | Fine, but 3D is not what we need | |

**Recommendation: PixiJS 8.** Folk Valley is a 2D scene played back from a timeline the
engine already decided. That needs a fast 2D renderer that does what it is told, not a game
framework with its own idea of the loop, physics and state. Pixi gives the meshes and filters
that make cut-out art look less like paper, it is the renderer the official Spine runtime
targets, and the sibling project already used it, so its pitfalls are known. Phaser is the
fallback if we later find ourselves rebuilding its scene and input systems by hand. Three.js
is out because the art pipeline produces 2D images. Plain DOM is right for the UI around the
scene, and Pixi's Canvas2D renderer covers devices without WebGL.

Settings to start with: `preference: 'webgl'` (WebGPU is not yet needed and is the less
tested path on mobile), resolution capped at `min(devicePixelRatio, 2)`, and filters
limited to short motion blurs and impact frames, because full-screen filters are what costs
on phones.

## 2. UI framework and build

| | Version, license | Measured size (gzip) | Notes |
|---|---|---|---|
| React + React DOM | 19.3.1, MIT | 69 KB (`react-dom/client`, esbuild, production) | The biggest ecosystem; every agent writes it well; `@testing-library` and Playwright patterns are standard |
| Preact | 11.2.0, MIT | 5 KB | React's API in a fraction of the size; `preact/compat` runs most React libraries |
| Svelte | 5.59.2, MIT | compiled per component | Small output, a different mental model, fewer libraries for charts and dialogs |
| Solid | 2.0.4, MIT | small | Fine-grained reactivity; smaller ecosystem |
| `@pixi/react` | 9.0.0, MIT | | Renders Pixi objects through React's reconciler |
| Vite | 8.3.8, MIT | | Dev server and bundler; handles workers with `new Worker(new URL(...), { type: 'module' })` |
| Vitest | 5.1.2, MIT | | Unit tests that share Vite's config |
| Playwright | 1.65.1, Apache-2.0 | | Browser tests, with a fake clock (below) |

**Recommendation: React 19 + TypeScript + Vite 8, Vitest and Playwright.** The UI is
controls, a balance, a statistics panel with charts, and settings: ordinary DOM work where
React's ecosystem and every agent's fluency save more than 64 KB costs. Preact is a drop-in
fallback if the bundle budget ever bites.

**Do not render the scene through `@pixi/react`.** The scene is driven frame by frame from
the timeline, not by React state, and putting it through a reconciler would put React's
scheduling between the timeline and the pixels. Mount Pixi once in a component with a ref,
hand it the timeline player, and let React own only the DOM around it. The renderer then has
no React dependency either, which keeps the choice of UI framework reversible.

## 3. Animating realistic riders

The hard problem. A trick or a bail is 1 to 3 seconds of a rider and a bike, board or
scooter moving through a recognisable motion, and the art comes from a generator that cannot
draw the same rider twice in a row reliably.

### Options

**A. Cut-out (puppet) rigging from separately generated parts.** Generate one realistic
reference image of a rider in a neutral pose, then use image edits of that same image to
produce each part on a plain background: head, torso, upper and lower arms and legs, hands,
feet, and the vehicle in its parts (frame, wheels, bars, deck). Cut, clean and pivot the
parts, pack them into one atlas, and animate a bone hierarchy. Because every frame reuses
the same pixels, the rider cannot drift. Realism comes from the texture; the weakness is
joints and silhouettes that look like paper, mitigated by overlapping joint caps, a slight
mesh bend at elbows and knees (`MeshPlane`), motion blur on fast frames, and a camera that
cuts and moves. Injury states are swapped parts or overlays (scraped knee, torn sleeve,
split lip, a cast and sling for the patched-up end card), which is exactly how rule 8's list
breaks down.

**B. Skeletal runtimes with an editor.**

- *Spine* (Esoteric Software): the best 2D skeletal tooling and an official Pixi 8 runtime
  (`@esotericsoftware/spine-pixi-v8` 4.3.13). But its runtime license lets you integrate the
  runtimes only if each user has their own Spine Editor license
  ([runtime license](https://esotericsoftware.com/spine-runtimes-license)). Essential is
  listed at $69 and Professional at $379, and Essential cannot save projects using meshes or
  IK ([purchase](https://esotericsoftware.com/spine-purchase)), which are the features a
  realistic rider needs. Rigs would live in a binary editor that agents cannot use, any
  contributor who edits one needs a seat, and whether players of a public open-source game
  count as "users" is not spelled out. A paid, closed-tool dependency is a poor fit for a
  free public project built largely by agents. Keep it as an upgrade path, not the plan.
- *DragonBones*: runtimes are MIT, but the JS runtime's Pixi adapter (`pixi-dragonbones`
  5.7.0-1) was last published in 2022 for Pixi 5-era APIs, not Pixi 8, and the project's
  README now points authors to a different editor, LoongBones
  ([DragonBonesJS](https://github.com/DragonBones/DragonBonesJS)). Rejected: we would be
  maintaining a fork.
- *Rive*: MIT runtimes (`@rive-app/canvas` 2.55.1) and a free editor, but free exports play
  a Rive splash screen unless a seat is paid ([pricing](https://rive.app/pricing)). It draws
  with its own renderer, so it would composite as a second canvas beside Pixi, and its
  files are authored only in Rive's hosted editor. Good for UI flourishes, not for the core
  rider.
- *Open in-repo rig*: the same idea as Spine, sized to what we need: a bone tree, per-bone
  keyframes (rotation, position, scale, part swap, z-order) with easing, and two-bone IK for
  feet on pedals and hands on bars. A few hundred lines of TypeScript, clips stored as JSON
  in the repo where agents and reviewers can read and diff them, and rendered with Pixi
  containers. This is option A's runtime.

**C. Pre-rendered sequences.** Frame-by-frame sprite sheets of each trick. The generator
cannot make them consistently, and a 1 to 3 second sequence at even 24 fps and 512 px per
frame breaks the 1 MB budget per sheet quickly, multiplied by every trick, bail and rider.
Only viable if the frames are rendered from something consistent, such as option A's rig
offline, which buys nothing over playing the rig live.

**D. Video or generated short clips.** Image-to-video models give the most realistic motion,
but each clip is a separate generation that may change the rider, the camera or the outcome,
must be checked against rule 8 frame by frame, and cannot be re-timed, re-coloured or given
a different injury without regenerating. Transparent video needs VP9-with-alpha WebM for
Chrome and Firefox and HEVC-with-alpha for Safari, two files per clip
([Jake Archibald](https://jakearchibald.com/2024/video-with-transparency/)). **Video is
not an allowed asset format under DR-001**, so this needs a superseding record. Animated
WebP is allowed but heavy, cannot be seeked by the timeline, and Pixi has no first-party
support for it. Rejected for riders; possibly useful for a bonus intro, behind a DR-001
change.

**E. Scripted ragdoll for show.** A 2D physics ragdoll (Planck 1.5.1 MIT, Matter.js 0.20.0
MIT, Rapier 2D 0.21.0 Apache-2.0) gives convincing tumbles. Run live, it is a problem:
floating-point physics can differ between browsers and frame rates, so the same spin could
look different, a limb can end in a pose that contradicts the injury the result names, and
skipping or seeking means re-simulating. Run **offline**, in a build script with a fixed
step and seed, it is a good authoring tool: simulate the bail, keep the takes that read
well, and bake the bone angles into an ordinary keyframe clip. The game then plays a clip,
and physics never runs in the browser.

### Recommendation

**Cut-out puppets on an in-repo TypeScript rig (A + the open rig), with ragdoll bails baked
offline into clips (E, offline only).** It is the only option that keeps a rider identical
across every trick, keeps the 1 MB budget (one atlas per rider, clips are small JSON), lets
the timeline seek to any moment, and keeps every animation readable and reviewable in git.
Variety comes from combining a small set of clips: approach, take-off, trick, and land or
bail, with injury overlays chosen by the result.

**Fallback: key-pose flipbooks.** If puppets read as paper dolls in the milestone 3
prototype, generate 4 to 8 full-body key poses per trick and bail by editing one reference
image of the rider into each pose, and play them as a flipbook with whole-body tweens,
motion blur, smears and impact frames between poses. Less smooth, more realistic per frame,
more art per trick, still seekable, still inside the budget at about 6 poses × 512 px in one
atlas. The two can mix: puppets for riding and approach, key poses for the peak of a trick
or the moment of impact.

Spine stays the upgrade path if the in-repo rig hits its limits (weighted meshes, a real
animator joining), at the price of editor seats and the license question above.

**Validate early.** Before milestone 4 commits to art, a spike should rig one generated
rider and one vehicle and play one landed trick and one bail. It is the cheapest way to find
out whether option A or its fallback is the one.

## 4. Presentation timeline

```
engine.spin(config, seed) ──► SpinResult            (src/engine, pure)
present(result, presentationConfig) ──► Timeline    (src/presentation, pure)
TimelinePlayer(timeline, clock) ──► scene state at t ──► Pixi renderer, DOM UI, audio
```

- **`present()` is pure.** A `Timeline` is plain data: events with a start, a duration,
  a type and their payload, all in presentation milliseconds. For example: `reelStop`,
  `trickAttempt { rider, trick, clip }`, `trickLand`, `bail { clip, injuries }`,
  `patchUp`, `winHighlight { lines }`, `countUp { from, to }`, `bonusEnter`. It only *reads*
  the result (rule 4); any variety (which landing clip, which camera angle) is chosen from
  values the result already carries or a seed derived from the spin seed, never from
  `Math.random`, so the same spin always looks the same. It lives in `src/presentation/` with
  no renderer dependency and is unit-tested in Node.
- **Rendering is a function of time.** Each event's renderer exposes `apply(t)`: put the
  scene in the state it has at time `t`, not "advance one frame". That makes seeking,
  skipping and testing the same operation as playing.
- **The player** owns a presentation time, advances it from an injectable `Clock` (the
  browser's rAF clock in the app, a manual clock in tests) multiplied by a speed, and calls
  `apply(t)` on the active events. Pixi's own ticker is stopped; the player calls
  `app.render()`.
- **Turbo** is a speed (for example 2× or 3×) plus a presentation config that shortens
  idle beats and drops optional camera moves. **Skip** seeks to the next *skip point* the
  timeline marks (after the reels, after a trick resolves, end of win count-up), or to the
  end; every event between is applied at its end state, so the screen always matches the
  result. Neither can change the outcome, because the outcome is already in the timeline.
- **Audio** schedules from the same events, so it follows turbo and skip without its own
  timing.

### Testing without wall-clock timing

1. **Unit (Vitest, Node):** snapshot `present(engine.spin(config, seed))` for fixed seeds;
   assert invariants on every timeline: events are ordered, every bail in the result has a
   `bail` event and a `patchUp` after it, the final `countUp` ends at the engine's win, skip
   points exist.
2. **Browser (Playwright):** in test builds, expose a small hook such as
   `window.__fv = { spin(seed), advance(ms), skip(), state() }` that uses the manual clock.
   Tests spin a known seed, `advance()` to chosen times, and assert `state()`: the active
   event, the visible injury overlays, the displayed balance. Assert *state*, not pixels;
   keep a handful of screenshot tests at fixed `t` for visual regressions only.
3. Where the hook cannot reach (third-party timers, CSS transitions in the UI), Playwright's
   [`page.clock`](https://playwright.dev/docs/clock) fakes `Date`, timers,
   `requestAnimationFrame` and `performance`, with `install`, `pauseAt`, `runFor` and
   `fastForward`.

## 5. Asset budget and formats

DR-001 allows at most 1 MB per committed file and only web formats.

- **Atlases, not loose files.** One atlas per rider (all parts and injury overlays), one per
  vehicle set, one for UI and symbols. Pack with `free-tex-packer-core` 0.5.0 (MIT) or
  `maxrects-packer` 3.0.0 (MIT) and encode with `sharp` 0.35.5 (Apache-2.0) in a build
  script that writes into `src/assets/`; originals stay in the ignored `art-source/`.
- **Size atlases at most 2048 × 2048.** Any WebGL device takes it, and a decoded atlas costs
  2048 × 2048 × 4 bytes = 16 MB of GPU memory regardless of file size, which is the real
  limit on phones. A 2048 atlas of photographic parts at WebP quality 80 should land well
  under 1 MB; that is an estimate to measure, not a measurement.
- **Resolution target:** a 1920 × 1080 landscape design canvas (and 1080 × 1920 portrait)
  with a rider about 600 px tall, so parts are authored at about 1.5× for high-density
  screens, then capped by the 2× renderer resolution.
- **WebP first, AVIF where it pays.** WebP covers about 97.3% of users and AVIF about 96.7%
  ([WebP](https://caniuse.com/webp), [AVIF](https://caniuse.com/avif)); AVIF usually
  compresses photographic backgrounds better but decodes slower. Ship WebP, and add AVIF for
  a file only where it measurably saves enough to matter; Pixi's `Assets` loads both and
  picks by `texturePreference`
  ([assets](https://pixijs.com/8.x/guides/components/assets)). Two formats per file double
  the asset count, so this is a per-file choice, recorded in `findings.md`.
- **The format list rules out video** (section 3), which favours rigs over clips.

## 6. Accessibility and reduced motion

- **The scene canvas is decorative** (`aria-hidden`); everything playable is in the DOM UI:
  real buttons, keyboard play (Space to spin, Escape or Enter to skip), visible focus.
- **The timeline narrates.** Each event carries a short text ("Rider lands a tailwhip",
  "Bail: scraped elbow, rider okay", "Win: 40 credits"), announced through an `aria-live`
  region, so a screen-reader user gets the same game without the animation.
- **`prefers-reduced-motion`** (and an in-game setting that overrides it): no camera shake,
  zooms or screen flashes; tricks shown as a short crossfade between key poses or skipped to
  their end state; turbo on by default. Because skip is a seek, reduced motion is just a
  different presentation config, not a separate code path.
- **No flashing** above three times a second (WCAG 2.3.1), including win celebrations.
- **A content setting for bails** (show the impact, or cut from take-off to the patched-up
  rider) is cheap with this architecture and worth offering given the injury theme.
- Pause the player on `visibilitychange`, and never require animation to finish before the
  balance is shown.

## Open questions for the lead session

- DR-001 excludes video. If the art direction wants a video bonus intro, that needs a
  superseding record first.
- Whether a content setting for bails belongs in the mechanics or the art-direction record.
- The animation spike (section 3) should run before milestone 4 commits to an art budget;
  the plan may want it as an explicit milestone 3 item.

## Proposed decision record

### DR-00X — PixiJS 8 renders the scene; riders are cut-out rigs on an in-repo runtime

- **Status:** proposed, 2026-11-25
- **Context:** Milestone 1 must choose how the game is rendered and animated. The scene is
  2D and realistic-looking, shows tricks and bails during ordinary spins and the bonus, and
  only displays a result the engine already decided (`AGENTS.md` rules 4 and 5). Art comes
  from an image generator that makes good single images but inconsistent multi-frame
  sequences. Assets must be web image or audio formats of at most 1 MB each, which excludes
  video (DR-001). The project is free, public and largely built by agents.
- **Decision:** The scene renders with PixiJS 8 (WebGL preferred, Canvas2D fallback),
  mounted imperatively inside a React 19 + TypeScript app built with Vite 8, tested with
  Vitest and Playwright. Riders and vehicles are cut-out rigs assembled from separately
  generated parts of one reference image, packed one rider per WebP atlas of at most
  2048 × 2048, and animated by a small in-repo TypeScript rig whose keyframe clips are JSON
  in the repository. Bail tumbles may be authored with a 2D physics ragdoll offline, but are
  baked into clips; no physics runs in the browser. `src/presentation/` turns a spin result
  into a plain-data timeline with a pure function; a player on an injectable clock renders
  the scene as a function of time, so turbo is a speed, skip is a seek, reduced motion is a
  presentation config, and browser tests drive a manual clock and assert timeline state.
- **Alternatives:** Phaser 4, rejected because it owns the game loop and scene state that
  the timeline must own, for features we would not use. Three.js, rejected because the art
  pipeline produces 2D images, not 3D models. Spine, rejected for now because its runtime
  license needs an editor seat per user, meshes and IK need the $379 Professional edition,
  and its rigs live in a closed editor; it is the upgrade path. DragonBones, rejected
  because its Pixi adapter stopped at Pixi 5-era APIs. Rive, rejected for riders because it
  is a second renderer with hosted-only authoring and a splash on free exports. Generated
  video clips, rejected because they cannot be kept consistent, seeked or re-timed and
  DR-001 excludes video. A live physics ragdoll, rejected because it can differ between
  browsers and contradict the injury the result names. Fallback if cut-outs look like paper
  in the milestone 3 spike: key-pose flipbooks generated by editing one reference image,
  played in the same renderer and timeline.
- **Consequences:** We write and maintain the rig runtime and a small clip format, and
  someone authors clips without a visual editor until we build or adopt one. Each rider
  costs one reference image and one set of part edits, rather than one generation per
  animation frame. The renderer has no React dependency, so either can change without the
  other. Revisit if the spike shows cut-outs cannot look realistic, if a real animator joins
  (Spine becomes worth its price), or if a video format is admitted to DR-001.

## Sources

Checked 2026-11-25.

- npm registry (`npm view <package> version license`): pixi.js 8.23.0, phaser 4.2.1, three
  0.187.0, react and react-dom 19.3.1, preact 11.2.0, svelte 5.59.2, solid-js 2.0.4,
  @pixi/react 9.0.0, vite 8.3.8, vitest 5.1.2, @playwright/test 1.65.1,
  @esotericsoftware/spine-pixi-v8 4.3.13 (Spine runtimes license), pixi-dragonbones 5.7.0-1
  (published 2022), @rive-app/canvas 2.55.1, gsap 3.15.1 (Webflow's no-charge license, not
  open source), planck 1.5.1, matter-js 0.20.0, @dimforge/rapier2d-compat 0.21.0,
  free-tex-packer-core 0.5.0, maxrects-packer 3.0.0, sharp 0.35.5.
- Bundle sizes: [Bundlephobia](https://bundlephobia.com/) for whole packages; esbuild
  measurements of minimal imports in `.scratch/rendering/size/` (not committed).
- [Spine runtimes license](https://esotericsoftware.com/spine-runtimes-license),
  [Spine purchase and editions](https://esotericsoftware.com/spine-purchase)
- [DragonBonesJS](https://github.com/DragonBones/DragonBonesJS)
- [Rive pricing](https://rive.app/pricing)
- [PixiJS 8 assets](https://pixijs.com/8.x/guides/components/assets),
  [meshes](https://pixijs.com/8.x/guides/components/scene-objects/mesh),
  [application and renderers](https://pixijs.com/8.x/guides/components/application)
- [Playwright clock](https://playwright.dev/docs/clock)
- [caniuse: WebP](https://caniuse.com/webp), [AVIF](https://caniuse.com/avif)
- [Video with transparency, Jake Archibald, 2024](https://jakearchibald.com/2024/video-with-transparency/)
- [GSAP standard license](https://gsap.com/standard-license)
