# Findings

What has been measured or learned while building Folk Valley, newest last. It exists
because a measure-change-measure loop produces knowledge that is expensive to rediscover.

## The rule that matters most

**Never claim an improvement without a control arm**: the same setup without the change,
run alongside it, on the same machine and data. Run-to-run noise is often larger than the
effect being claimed; anything smaller than the noise is not a result.

## How to add a finding

Write it here **the same day**, with:

1. What you changed, precisely enough to reproduce.
2. The control and treatment numbers, and n.
3. The conditions: versions, hardware, settings, anything that would change the number.
4. What you now believe, and what would change your mind.

Negative results are the most valuable entries. A page that only records wins lets the next
person repeat every failure.

## Findings

### 2026-11-25 — Feature frequencies of the placeholder configuration (simulated)

- **What:** 1,000,000 paid spins of `placeholder-untuned-0` through the features and `spin`
  (DR-012), at bet level 1, master seed `31fd6640eb7e734a` (text seed
  `feature-rates-2026-11-25`). The evaluator was a stub that pays nothing and counts Flyers
  for real, so this measures how often the features fire, not RTP. Script in
  `.scratch/feature-rates/` (not committed).
- **Simulated counts:** trick attempts 463,316 (1 in 2.2 spins); landed 231,552, bailed
  231,764; tiers easy 278,057, medium 138,535, hard 46,724 (the configured 6 : 3 : 1).
  Scar Card fills 46,321; a filling bail held back by Flyers on the same spin 155. Sessions
  53,605 (1 in 18.7): 46,321 from the card, 7,284 from Flyers (0.73% of spins). Endings
  53,220 pain-limit, 385 spins-out; 330,880 free spins, 6.2 per Session.
- **Checks against expectation:** the land share, 50.0%, matches the weighted tier odds
  (0.6·0.6 + 0.3·0.4 + 0.1·0.2 = 0.50); fills equal bails ÷ 5 less those held back.
- **What it means:** the placeholder fires features far too often for DR-006 (a trick about 1
  in 8–12 spins, a Session about 1 in 150). The Kicker density on reels 2–4 and the card size
  are the levers; the tuning work must cut both. Nearly every Session ends at pain 3 because
  the placeholder ladder's bail odds are high from rung 2 up.

### 2026-11-25 — Whole-game return of the placeholder configuration (simulated)

- **What:** 1,000,000 paid spins of `placeholder-untuned-0` through `spin` with the real
  evaluator (PR #2), at bet level 1, master seed `167dd6868380947e` (text seed
  `feature-rtp-2026-11-25`), the Scar Card carried from spin to spin. Script in
  `.scratch/feature-rates/` (not committed).
- **Simulated:** return 72.97% of the amount bet (SE 0.30 pp, from the sample SD of 2.96×
  bet per spin), of which base game and landed tricks 55.01% and Sessions 17.96%. No spin
  reached the 2,500× cap.
- **What it means:** the untuned placeholder pays well under DR-006's 96% while firing its
  features far too often (the entry above), so its pays are low and its features cheap.
  No theoretical figure exists yet to compare with; the analyser provides that. This is a
  wiring check and a baseline for tuning, not a number to quote.

### 2026-11-25 — The placeholder's theoretical figures, against its simulations (theoretical)

- **What:** the new analyser (`analyse`, analyser version `folk-valley-analyser-1`) on
  `placeholder-untuned-0`, compared with the two simulated entries above.
- **Theoretical:** RTP 73.229% (no spin can reach the cap, so capped and uncapped agree);
  split as the statistics count it: base ways on spins without a landing 7.05, every base win
  on landed spins 48.19, Sessions 2.41 from Flyers and 15.59 from the card; trick attempts
  0.46362 per spin; Sessions 0.053454 per spin, 0.0071245 from Flyers.
- **Against the simulations:** RTP 72.97% simulated (SE 0.30 pp, z −0.86); base ways plus
  landed tricks 55.01 simulated against 55.23; Sessions 17.96 against 18.00; Session rate
  0.053605 against 0.053454 (z 0.67); Flyer Sessions 0.007284 against 0.0071245 (z 1.9).
  All within 4 standard errors.
- **What it means:** the analyser and the engine describe the same game, from two directions
  that share only the evaluator, before any tuning began.

### 2026-11-25 — The analyser's speed (one development machine, Node 24)

- **Base game:** the reel sweep (`reelSweep`) takes about 40 ms on the placeholder (952 cells)
  and on the shipped strips (2,890 cells), against 2.4 s and 126 s for brute force over every
  combination of distinct windows (3.1·10⁷ and 1.5·10⁹). The two agree cell for cell on both,
  plain and with every wild set.
- **Session:** the truncated distribution over 36 ladder states with 887 distinct free-spin
  values, up to the 50,000-coin cap, takes about 3 s; a whole `analyse` of the shipped
  configuration about 3.5–4 s. That made tuning by repeated exact analysis practical.
- **The float bound:** every distributional figure's relative error is at most 9.3·10⁻¹¹;
  the float Session mean matches the exact rational one to 3·10⁻¹⁴.

### 2026-11-25 — `folk-valley-96-v1`, the tuned configuration (theoretical)

- **What:** `FOLK_VALLEY_CONFIG` (DR-013), analysed exactly. Every figure here is theoretical:
  computed by the analyser over the Scar Card's stationary distribution, never simulated.
- **RTP:** 95.99728% with the 2,500× cap; the uncapped value is the exact fraction in the
  report and differs by 9·10⁻¹⁵. DR-006 asks for 96.0% ± 0.05 pp.
- **Split, as DR-006 counts it** (the trick is only what a landing adds): base game 55.48,
  trick 13.19, Session 27.33 points. **As the statistics count it:** base ways 50.44, landed
  spins 18.23, Sessions 7.11 from Flyers and 20.22 from the card.
- **Volatility:** σ 5.715× bet per paid spin; σ over consecutive spins 5.044 (the card makes
  its Sessions more regular than chance). Hit frequency 31.16%, win above bet 17.19%, LDW
  13.97% (under half of all hits), even money never (no combination pays exactly 20 coins).
- **Features:** a trick 1 in 9.53 paid spins (easy 6.30%, medium 3.15%, hard 1.05% of spins),
  landing 30% overall (36%, 26%, 6%). A Session 1 in 141.1: 1 in 191 from the card and 1 in
  543 from Flyers (3 Flyers 0.17856%, 4 Flyers 0.00539%, 5 Flyers 0.0000636%). A 3-Flyer or
  card Session pays 38.5× bet on average (SD 46.5), plays 8.5 spins and ends at pain 3 93.9%
  of the time. P(bail) 7.35% per spin; the card's stationary distribution is nearly uniform,
  0.07142 per mark below the top and 0.07148 at 13 marks.
- **Distribution of one paid spin's payout, × bet:** 0: 68.84%; (0, 1): 13.97%; [1, 2): 8.08%;
  [2, 5): 6.44%; [5, 10): 1.33%; [10, 20): 0.70%; [20, 50): 0.41%; [50, 100): 0.16%;
  [100, 200): 0.059%; [200, 500): 0.0097%; [500, 1000): 2.1·10⁻⁶; [1000, 2500): 1.3·10⁻⁸;
  the cap: 1.0·10⁻¹⁶.
- **What would change my mind:** a nightly brute-force mismatch, or a long run outside
  4·σ/√N.

### 2026-11-25 — `folk-valley-96-v1`, long seeded runs against the analyser (simulated)

- **What:** `npm run verify:long` with its defaults, on one development machine (28 threads):
  20 seeds `long-run-2026-11-25-00` … `-19` (text seeds, `fnv1a64-splitmix-v1`), 5,000,000
  paid spins each at bet level 1 with lanes of 10⁶, RNG `xoshiro128ss-v1`; the base game
  alone over 10⁷ grids (`long-run-2026-11-25-base`); 10⁶ forced 3-Flyer Sessions
  (`long-run-2026-11-25-session`). 281 s in all, 126 s of it brute force.
- **Simulated, whole game, 10⁸ paid spins pooled:** RTP 95.9836% (theoretical 95.9973%, SE
  0.050 pp with σ for consecutive spins, z −0.27); hit frequency 31.1542% (z −0.49); win above
  bet 17.1856% (z −1.16); LDW 13.9686% (z 0.60); trick rate 0.104934 (z −1.22); Session rate
  0.0070856 (z −0.33). Per seed, RTP 95.52–96.39%; the 20 z-scores have mean −0.06 and
  variance 1.37, inside the sweep's band (mean within ±0.89, variance 0–2.30). Largest
  observed win 1,008× bet.
- **Simulated, components:** base game RTP 55.413% (theoretical 55.482%, z −1.61), base hit
  frequency 30.775% (z −0.61); Session mean 38.539× bet (theoretical 38.526, z 0.29),
  pain-limit endings 93.914% (z 0.03).
- **Brute force:** equal to the reel sweep, cell for cell, plain and for all six wild sets.
- **What it means:** the engine plays the game the analyser describes. The seed sweep's
  variance of 1.37 is within noise for 20 seeds; if nightly sweeps keep landing above 1, the
  long-run σ is the first suspect, and the toy test that checks it against Var(ΣX)/T the
  second.

### 2026-11-25 — Tuning notes, including what did not work (theoretical)

- **Trick:** with easy tricks landing half the time the trick's uplift was about 15 points;
  one wild reel on 2–4 multiplies the average grid's win about five-fold, so the landing odds
  are the trick's main dial. Hard tricks turning two extra reels wild paid 37× bet when landed
  and needed a 6% landing rate to stay in budget.
- **Session:** a top rung of 15× put σ at 8.9 and the Session at 42 points; 8× gave σ 5.7.
  Scar Cards of 5 and 10 marks made Sessions far too frequent once the trick rate was right
  (1 in 112 at 10 marks); 14 marks gave 1 in 191 from the card.
- **Fine tuning:** each 1/1000 step in every rung's land weight moves the RTP about 0.1 pp,
  and the bottom rung alone about 0.017 pp, which put the RTP within 0.003 pp of 96%.
- **Negative result, the cap:** P(reaching 2,500×) is about 10⁻¹⁶, nowhere near math-targets'
  hope of 1 in 5–50 million. The Session's tail falls too fast: [1000, 2500) is already 1.3·10⁻⁸.
  A reachable cap needs a deliberately heavier tail (a rare, steep top rung) and a retune,
  noted in DR-013.

### 2026-11-25 — The animation spike: cut-out rig against key-pose flipbook

- **What:** DR-007's milestone 3 spike, for Kerb: a master sheet, a six-part body sheet (then
  one edit of it), a board sheet, a reference pose and seven key poses, all from the
  `codex-image` skill (`gpt-6.1-sol`, low effort), 16 images in about five minutes of
  generation time, none refused. Two prototypes in PixiJS 8 played the same ollie and bail,
  with a cut-away on impact, side by side: (a) a cut-out rig, about 85 lines of runtime with
  pivots, JSON clips, easing and two-bone leg IK; (b) the eight poses as a flipbook with
  70 ms cross-fades and whole-body tweens. Not committed: art and prompts in
  `art-source/spike/`, the page, scripts and recordings in `.scratch/spike/`. Detail and
  the proposed decision record: [`research/animation-spike.md`](research/animation-spike.md).
- **Looks:** the rig moves smoothly and its feet stay on the deck, but it reads as a puppet:
  thinner and flatter than the art, sleeves that rotate as rigid tubes overhead, shoes that
  tilt with the shins (no foot bone), and a poor sitting pose. The flipbook frames look like
  the painting, but the motion jumps between poses, cross-fades show two riders at once, and
  the generator drifted on 6 of 7 poses (head size, torso turn, once the facing).
- **Authoring cost per clip:** rig 69 keys on 15 channels (ollie) and 91 on 16 (bail), set by
  hand in about 20 to 30 minutes each over three capture rounds, and no new images. Flipbook
  12 and 21 keys on 2 to 4 channels in about 5 minutes, plus 4 to 6 generations per clip and
  rider.
- **Part seams:** part sheet 01 painted bare-skin caps on every joint, even under the shirt
  and jeans, so skin showed at the hips and knees; the arms were about 25% too long and the
  board about twice the body's scale. One edit asking for caps "made of whatever covers that
  joint" fixed the hips, knees and shoulder; only the elbows and a sliver under the hem still
  show. Scale and pivots were set by hand per sheet.
- **Sizes against DR-001 (WebP q85, alpha q90, at shipping resolution for a 2× display):**
  rig, 7 parts and the board, 74 KB in all; flipbook, 8 trimmed frames, 652 KB (about 82 KB
  each). Both are far under 1 MB per file, but a flipbook set of 10 clips × 5 frames is about
  4 MB per rider, about forty times the rig.
- **Injury trial (DR-009):** a bent forearm and an open fracture at the `broken` level, as
  edits of Kerb's reference, each with one follow-up edit asking for a clear deformity. All
  four were accepted, with no refusal; none shows a visibly bent forearm, and only the
  open-fracture follow-up shows a small bone tip, near the elbow. Codex said so itself, for
  example: "The requested 30-degree mid-forearm deformity still isn't clearly rendered."
  ComfyUI was not used, since DR-009's fallback is for refusals. Every reply is quoted in the
  research page.
- **What I now believe:** rigs for motion, painted held frames for the aftermath beats after
  the cut. Codex will not draw a clear deformity on request. What would change my mind:
  a playtest that reads the rig as paper even with the fixes, or a part sheet method that
  keeps volume (three-quarter parts or mesh bends).
