# Research: the animation spike, cut-out rig against key-pose flipbook

DR-007 chose cut-out rigs for the riders, with key-pose flipbooks as the fallback, and asked
milestone 3 to settle the choice before milestone 4 commits the art budget. This page records
that spike: one rider (Kerb), one trick (an ollie) and one bail with the cut-away on impact,
built both ways and played side by side. The numbers are also in
[`findings.md`](../findings.md) (2026-11-25, the animation spike).

The prototypes, the art and the recordings are not committed: the art is in the ignored
`art-source/spike/` folder (with every prompt in `prompts/` and every Codex reply in `logs/`),
and the page, the scripts and the captures are in the ignored `.scratch/spike/` folder. Its
`README.md` says how to run and re-capture them.

## Summary

- **The rig moves well and costs almost nothing to ship; it looks like a puppet.** Seven parts
  and a board, 74 KB at shipping resolution, any number of clips as small JSON. Motion is
  smooth and exactly seekable. But the figure is thinner than the art, sleeves rotate as rigid
  tubes when an arm goes overhead, shoes tilt with the shins, and joints show where pieces
  overlap.
- **The flipbook looks like the painting; it does not move.** Each of its 8 frames is a full
  painted pose with deep crouches and real cloth folds, but between frames the body jumps or,
  with a cross-fade, shows two riders at once. The generator also drifts: head size, torso
  turn and once the facing direction change from frame to frame. 8 frames cost 652 KB at
  shipping resolution.
- **Most joint seams were fixed by one prompt rule.** The first part sheet painted bare-skin
  caps on every joint, including those under clothing. One edit asking for caps made of the
  covering fabric removed the skin at hips and knees and closed the shoulder.
- **Injury trial (DR-009): accepted, not refused, but not drawn.** Four requests for a bent
  forearm or an open fracture were all accepted, and in none is the forearm visibly bent. The
  open fracture shows a small bone tip near the elbow after one follow-up edit.
- **Recommendation: a hybrid.** The rig carries everything that moves; painted held frames
  carry the moments after the cut-away. The proposed decision record is at the end.

## What was made

All images came from the `codex-image` skill (Codex CLI, `gpt-6.1-sol`, low effort), each
prompt starting with DR-008's style block and a fixed descriptor block for Kerb: a woman
about 26, olive skin, dark hair in a messy bun, **no helmet** (DR-008), an oversized mustard
t-shirt, ripped black wide-leg jeans and off-white canvas high-tops, and a plain wooden deck.
Sixteen images took about five minutes of generation time, in waves of parallel jobs of
about 60 to 80 seconds each. None was refused.

| Image | How | Result |
|---|---|---|
| Master sheet | New, with the art trial's rider sheet attached as a style anchor | Front, three-quarter and side views plus the board twice. Accepted at the first attempt; consistent across views, painterly, no text or branding |
| Body part sheet 01 | New, master attached: six parts in a 2 × 3 grid, strict side view, transparent | Six clean, separated parts. Every joint end painted as bare skin, even inside the shirt and jeans; sleeveless torso; arms about 25% too long for the torso |
| Body part sheet 02 | Edit of sheet 01: caps in the covering fabric, arms 20% shorter | Fabric caps on thighs, shins, upper arms and the shoulder. A small skin cap is left under the shirt hem |
| Board parts | New, master attached: board in side profile and one wheel | Clean board; drawn about twice as large as the body parts, so its scale is set by hand |
| Flipbook reference pose | New, master attached: Kerb rolling, side view, transparent | Good; fills more of the frame than asked |
| 7 key poses | Each a new generation with the reference pose attached, in parallel: crouch, pop, peak and landing for the ollie; slip, mid-air fall and the aftermath with a thumbs-up for the bail | All recognisably Kerb in the same outfit and finish. Codex itself reported drift on 6 of 7: head slightly larger (3), torso turned towards the viewer (3), and the face turned the wrong way in the fall |

Making the key poses as parallel new generations, each with the reference attached, rather
than as a chain of edits of one Codex session, kept every pose one step from the reference
and took one wave instead of seven. That is still "edits of one reference image" in the
sense DR-007 meant.

## Prototype A: the cut-out rig

A runtime of about 85 lines of TypeScript (plus about 110 for the page that plays both
prototypes): a bone tree in which every part has a pivot and a
joint in normalised texture coordinates and a scale; clips in JSON with per-bone `x`, `y` and
`rot` tracks and per-key easing (`linear`, `in`, `out`, `inOut`, `step`, `outBack`); an
analytic two-bone IK for the legs, whose targets live in the board's space during the ollie
(so the feet stay on the deck as it pops) and in the hips' space during the bail; and flat
z-ordered sprites, so the far arm and leg sit behind the torso and the near ones in front.
Far limbs reuse the near parts with a darker tint. The cut-away is a `step` key on every
channel at the impact time, plus a 0.12 s white flash and a dust puff drawn by code.

**How it looked.** The ride, the crouch, the pop and the landing read clearly, and the IK
keeps the feet glued to the deck through the pop. The tumble before the cut reads as a
backwards fall. Weaknesses, in order of how much they show:

1. **Thin, flat silhouette.** The parts are each drawn in strict profile and the oversized
   shirt and wide jeans lose their volume, so the rig looks slimmer than the master sheet and
   much flatter than the flipbook frames.
2. **Rigid sleeves.** With an arm overhead or flung out, the short sleeve rotates as a stiff
   tube and leaves the shoulder. It needs a raised-arm sleeve as a part swap, or a mesh bend.
3. **No foot bone.** Each shoe is painted onto the shin, so the shoe tilts with the shin
   instead of staying flat on the deck. A separate foot part with its own IK end is needed.
4. **Joint seams.** With sheet 01, a skin cap showed between shirt and jeans and at both
   knees; with sheet 02 those are gone and the remaining seams are at the elbows.
5. **Pose limits.** The sitting aftermath is the weakest pose: a propped hand sinks below the
   ground line and the body folds like cardboard. A full-body pose far from standing is where
   a cut-out rig looks worst.

**Authoring cost per clip.** The ollie is 15 channels and 69 keys; the bail with its cut-away
is 16 channels and 91 keys. Both were written by hand as numbers and needed three rounds of
capture and adjustment, about 20 to 30 minutes each for an agent. A person would want a small
pose editor (drag bones, write keys) before authoring dozens of clips, which is milestone 4
tooling, not art. Every new clip after the first costs no new images.

## Prototype B: the key-pose flipbook

Eight full-body frames (the reference and seven key poses), each sitting its lowest pixel on
the ground line and keeping the generator's horizontal framing, played with a 70 ms
cross-fade between frames and tweened whole-body offsets (height of the jump, the lean into
the fall). The cut-away is the same flash and dust, with a hard cut to the aftermath frame.

**How it looked.** Every frame is a convincing painting: the crouch is deep, the pop has
the right weight, the aftermath's thumbs-up is exactly the Folk Valley beat. In motion it
reads as a motion comic: about 6 frames per second of story, a visible jump between poses,
and during each cross-fade two semi-transparent Kerbs. The generator's drift shows in
playback as a head that swells and shrinks and a body that turns between frames, and the
mid-air fall frame is drawn larger than the others. Fixing the drift needs a per-frame
scale and offset pass by hand, and re-generating frames that drift too far.

**Authoring cost per clip.** One generation per key pose (about 60 to 80 seconds, run in
parallel), a review of each, then a timing file of 2 to 4 channels and 12 to 21 keys,
written in about 5 minutes. The cost is in images: every trick and bail needs its own 4 to 6
frames per rider, and each new frame can drift.

## Side by side

| | Cut-out rig | Key-pose flipbook |
|---|---|---|
| Looks like the painted art | Partly: flat and thin, puppet-like at extreme poses | Yes, frame by frame |
| Motion | Smooth, 60 fps, exact easing | Jumps between poses; ghosting during cross-fades |
| Consistency across clips | Perfect: the same pixels in every frame | Drifts in head size, torso turn and facing |
| Seek, turbo and skip (DR-007 timeline) | Exact, by construction | Exact for timing; frames are discrete |
| New images per extra clip | None | 4 to 6 per rider |
| Size for Kerb's spike (WebP, shipping resolution) | 74 KB for 7 parts and the board | 652 KB for 8 frames, about 82 KB each |
| Injury states | Overlays and part swaps on the same parts | A redrawn frame per injury level, each a new chance to drift |
| Authoring per clip | 70 to 90 hand-set keys; wants a pose editor | 12 to 21 keys plus 4 to 6 generations |

**Against DR-001's budget.** Both fit the 1 MB per-file limit. A rider's whole rig, with near
and far parts, a foot, two or three head expressions and injury overlays, stays well under
1 MB in one atlas, so the per-rider estimate of 400 to 800 KB in the art-direction page looks
generous. A flipbook needs about 80 KB per frame at shipping resolution, so a 2048 atlas
holds about one or two clips. A modest set of 6 tricks and 4 bails at 5 frames is about
4 MB per rider and 16 MB for four, in a dozen or more files. That is inside DR-001's
100 MB review point, but forty times the rig.

## The injury trial (DR-009)

Two edits of Kerb's reference at the `broken` level, each prompt following the do-not-show
list otherwise (she is conscious, wincing and half laughing; no blood pools or spray, no
gore beyond the injury, no impact moment), then one follow-up edit of each that asked for a
clear 30-degree deformity. Codex's own one-line replies, verbatim:

| Request | Outcome | Codex's reply |
|---|---|---|
| Bent forearm, no bone, first attempt | Accepted. Bruise and swelling drawn; no visible bend | "Generated one square, painterly card of Kerb seated after a bail, cradling her bruised left forearm beside her skateboard. The forearm bend is subtler than the requested obvious fracture angle." |
| Bent forearm, follow-up edit | Accepted. Darker bruise; still no visible bend | "Generated the edit with stronger purple bruising and the supporting hand moved lower. The requested 30-degree mid-forearm deformity still isn't clearly rendered." |
| Open fracture, first attempt | Accepted. A small wound with a sliver of white; no visible bend | "Generated one square, painterly image of Kerb seated after a bail in a sunlit skatepark. The localized open wound is visible, though the forearm's abnormal bend is subtler than requested." |
| Open fracture, follow-up edit | Accepted. A small, clearly white bone tip near the elbow, a little blood around it; no visible bend | "Edited the image with a clearer exposed bone tip and her right hand supporting the arm from below. The injury sits closer to the elbow than requested, and the mid-forearm bend remains subtle." |

**What it means.** Codex does not refuse the `broken` level, so DR-009's fallback (which
applies "only when it refuses") was not triggered, and ComfyUI was not used. But it softens
it: across four attempts it never drew a limb bent at a wrong angle, and it drew visible bone
only small and at the elbow. If the owner wants a clearly deformed limb, the art will not
come from Codex prompting alone. The options are a manual paint-over of a Codex image, more
prompt iteration, or reading DR-009's fallback as covering "accepted but not drawn", which
is the owner's call. With a rig, a bent limb can also be made without new art: rotate the
forearm's two halves at a break point, which is one more part split per limb.

## Open questions for the owner

1. Is the rig's puppet look acceptable for the moving beats, given the fixes listed above,
   or should more of the screen time go to painted frames?
2. Does DR-009's ComfyUI fallback cover a request that Codex accepts but does not draw?

## Proposed decision record

### DR-0XX — Riders move as cut-out rigs; painted held frames carry the beats after the cut

- **Status:** proposed, 2026-11-25
- **Context:** DR-007 chose cut-out rigs with key-pose flipbooks as the fallback and asked a
  milestone 3 spike to settle the choice. The spike built both for Kerb, an ollie and a bail
  (this page). The rig moved smoothly and fit in 74 KB but looked like a puppet in extreme
  poses; the flipbook looked like the painting but jumped between poses, drifted between
  frames and cost 652 KB for 8 frames.
- **Decision:**
  - **The rig animates everything that moves:** the ride-in, every trick and every bail up
    to the cut-away on impact. Clips stay as JSON on the in-repo runtime from DR-007.
  - **Painted held frames take over after the cut:** the bail aftermath (sitting, scuffed,
    thumbs-up), the `broken` card and the patch-up card are single generated images of the
    rider, edited from the master sheet, shown still with only a camera move. The cut-away
    on impact is the seam, so the switch from rig to painting is never seen.
  - **Rig parts follow the spike's rules:** joint caps are painted in whatever covers the
    joint, never bare skin under clothing; a separate foot part with its own IK end; near
    and far limbs; a raised-arm sleeve as a part swap; two or three head expressions; and a
    hand scale pass against the master sheet, since the generator does not keep scale.
  - **A small pose editor** (drag bones, write keys to the clip JSON) is milestone 4
    tooling, before clips are authored in bulk.
  - Flipbook frames are not used for motion.
- **Alternatives:** The rig alone, rejected because its worst poses are the sitting and
  sprawled ones after a bail, which are the beats the player looks at longest. Flipbooks for
  everything, rejected for the drift, the ghosting and forty times the size, with every new
  trick needing new art per rider. A flipbook only for trick peaks, rejected because the
  switch would be visible mid-motion, where nothing hides it.
- **Consequences:** Each rider needs a master sheet, two or three part sheets and a handful
  of held frames (aftermath, broken, patch-up, per injury level and gore setting) rather than
  a frame set per trick, so adding a trick costs a clip, not art. The milestone 4 art list
  and the presentation timeline gain a "held frame" beat after the cut. The rig's puppet look
  in the moving beats is accepted; revisit with Spine-style mesh deformation (DR-007's
  upgrade path) if playtests say it reads as paper. The injury trial's result stands apart:
  Codex accepts the `broken` level but does not draw a clear deformity.
