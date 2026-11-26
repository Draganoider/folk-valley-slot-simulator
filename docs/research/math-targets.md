# Research: math targets and how they are verified

**Status: research for milestone 1, 2026-11-25. Nothing here is decided until the lead
session turns it into a decision record in [`PLAN.md`](../PLAN.md).**

This page proposes the numbers Folk Valley's math is tuned towards: RTP, volatility, hit rate,
how RTP splits across the game's parts, and bonus frequency. It also covers how the
theoretical values are computed, how simulation checks them, what the statistics panel shows,
and what the engine's RNG has to do. It follows the hard rules in [`AGENTS.md`](../../AGENTS.md):
the engine decides everything before presentation (rule 4), RTP comes only from strips,
feature probabilities and the paytable, the engine is pure seeded TypeScript (rule 5), and
theoretical and observed statistics are kept apart (rule 6).

All figures are in **multiples of the total bet per paid spin** ("x bet"). "RTP" means
expected payout divided by wager over a paid spin, counting everything that spin triggers.

## 0. Assumptions about the mechanics

A sibling session is designing the mechanics, so these targets are written to hold across
the likely shapes. The assumed structure:

| Part | Assumed shape | Variants the targets must survive |
|---|---|---|
| **Base game** | 5 reels, 3 or 4 rows, fixed lines or ways, explicit reel strips, uniform stops | Lines vs ways; 3 vs 4 rows; one or several strip sets |
| **Trick feature (ordinary spins)** | Some spins start a trick: a ladder of up to *n* attempts, each landing with a configured probability. A landing raises a bank or multiplier; a bail ends the ladder | (a) standalone ladder that pays its bank; (b) a trick that multiplies the spin's line win; (c) bails also feed something (a consolation pay or a meter) |
| **Bonus** | A scatter-style trigger starts a run of free spins, with tricks and a rising multiplier or ladder inside, and retriggers up to a cap | Free spins vs a "session" of runs; with or without retrigger; with or without carried state |

Two variants change the analysis, not only the numbers, so they are flagged throughout:

- **Persistent cross-spin state**, such as a bail meter that fills over ordinary spins. Spins
  are no longer independent, and RTP becomes a long-run average (section 5.4).
- **Player choice that changes expected value**, such as "bank it or try the next trick".
  RTP then depends on strategy (section 5.5).

## 1. Target RTP

**Proposal: 96.0% theoretical RTP, tuned to within ±0.05 percentage points of it, with
one configuration for every bet level.**

Typical ranges:

| Setting | Typical RTP | Notes |
|---|---|---|
| Land-based casino slots, US | about 85–95% | Often lower on low-denomination machines. State regulators set minimums, typically 75–87%, and some publish observed figures |
| Land-based, UK and EU arcade/AWP machines | about 70–90% | Lower stakes, set by category |
| Online video slots | about 94–97% | 96% is the figure most often quoted. Many titles ship several RTP versions, such as 96 / 94 / 92 / 88, and the operator picks one |
| Video poker, optimal play | 99%+ | Not a slot, but a useful contrast: there skill matters |

Why 96%:

- It is the most recognisable "industry standard" number, so what the simulator teaches
  matches what a curious player has read about.
- It is high enough that a session feels like a game, and low enough that the house edge is
  plainly visible over a long simulation: 4% of everything wagered, on average, never comes
  back.
- Tuning to ±0.05 pp only works because the theoretical value is **computed exactly** (section
  5), so it never waits on a noisy simulation.

The real slot practice of shipping several RTP versions of one game is a strong educational
idea: the same reels and art at 96% and at 88%, where the difference is invisible on a single
spin and obvious over a million. It is left as an open question (section 10) rather than in
scope.

## 2. Volatility class and how it is measured

**Proposal: medium volatility, defined as a theoretical per-spin standard deviation of 4–7 x
bet, aiming at about 5.5.**

There is no industry-standard volatility scale. Studios label games by feel, and regulated
PAR sheets publish a *volatility index* (VI = z · σ, for example 1.645σ at 90%). This project
therefore defines its own classes on σ, the standard deviation of the return of one paid spin
including everything it triggers, and documents them:

| Class (project convention) | σ per paid spin (x bet) |
|---|---|
| Low | under 3 |
| Medium | 3–7 |
| Medium-high | 7–12 |
| High | over 12 |

σ alone does not describe the feel, so the volatility profile is four numbers, all
theoretical and all computed from the model:

| Metric | Definition | Target |
|---|---|---|
| **σ** | SD of the paid-spin return, x bet | 4–7 |
| **Hit frequency** | Pr(payout > 0) | 28–35% |
| **Win-above-bet frequency** | Pr(payout > bet) | at least 12% |
| **Losses disguised as wins (LDW)** | Pr(0 < payout < bet) | reported, and at most half of all hits |
| **Max-win cap** | Total payout of one paid spin, features included, is capped | 2,500x bet |
| **Probability of the cap** | Pr(a paid spin reaches the cap) | roughly 1 in 5–50 million |

Notes:

- **LDWs are called out on purpose.** A spin that pays 0.4x a 1x bet plays a win
  celebration while losing money. Real slots use this heavily. Folk Valley should neither hide
  it nor exploit it: the panel counts LDWs separately (section 7), and the "any payout" hit
  rate never appears as an unlabelled "win rate".
- **The cap** applies to the whole paid spin: base game, trick and bonus together. When a
  bonus reaches it, the bonus ends and pays exactly the cap. The cap lowers RTP slightly, and
  the analyser models it rather than ignoring it (section 5.3). A cap keeps the variance
  finite and bounded, which is what makes the simulation tolerances in section 6 meaningful.
- **Why medium.** At a bonus every ~150 spins, high volatility would mean long dry runs in
  what is meant to be a short, readable educational session. Medium still produces
  memorable big wins. The variance budget in section 3 shows that the proposed split lands
  near σ ≈ 5.8 without forcing it.

## 3. How RTP splits: starting point for tuning

| Source | Target share of the 96% | Range to tune within | Implied per-event mean |
|---|---|---|---|
| Base-game line (or ways) wins | 55% | 50–62% | – |
| Trick feature in ordinary spins | 13% | 8–18% | about 1.4x bet per trick at 1 in 11 spins |
| Bonus, everything inside it | 28% | 22–35% | about 42x bet per bonus at 1 in 150 |
| **Total** | **96%** | | |

The shares must reconcile exactly: every payout is attributed to one source, nothing is
counted twice, and the three theoretical contributions sum to the theoretical total. If the
trick multiplies a line win (variant b), the trick's share is the *extra* it adds,
E[win · (M − 1)], and the base share stays the un-multiplied win.

**Trigger frequencies.**

- **Bonus: about 1 in 150 paid spins, within 1 in 120–200.** At 4–6 s a spin with
  presentation, that is a bonus every 10–15 minutes of play, often enough to see within a
  session and rare enough to feel earned. Defuse Protocol used about 1 in 117.
- **Trick feature: about 1 in 8–12 paid spins.** Tricks are the theme, so the player should
  see one every minute or so. Most should be small, with the occasional deep ladder.

**Variance budget** (rough, to check the targets agree with each other). With a bonus at
p = 1/150 paying a mean of 42x with a conditional SD of about 50x, the bonus contributes about
p·(SD² + mean²) ≈ 28 to the variance. The example trick ladder in section 5.2 (mean 1.43x, SD
2.44x, 1 in 11) contributes about 0.7, and base wins about 3–5, giving σ ≈ 5.8: medium. If the
bonus's share or its spread grows, σ moves into medium-high quickly. The bonus's conditional
SD is the main volatility dial.

## 4. Bonus trigger frequency, computed exactly

For a scatter trigger with independent reels, let *p_i* be the probability that reel *i*'s
**whole visible window** shows the qualifying count. It comes from enumerating that reel's
L stops, not from dividing scatter count by strip length, which is wrong as soon as two
scatters can sit in one window. For a "3 or more" rule, convolve the per-reel distributions of
scatter count (0, 1, 2… per window) across the reels. That gives the exact distribution of the
total scatter count, and from it every "3, 4, 5 scatters" probability. Defuse Protocol's
formula over qualifying reel subsets is the special case with at most one scatter per reel and
is worth keeping.

"1 in N" is reported as 1/P only because each paid spin is independent. With persistent state
(section 5.4) it is the long-run rate under the stationary distribution, and is labelled so.

## 5. Computing the theoretical RTP

The engine ships an **analyser**, pure TypeScript beside the engine, that computes every
theoretical figure from the configuration. Theoretical values come only from it, never from a
simulation ([`PLAN.md`](../PLAN.md) section 4). The analyser should produce the
**distribution** of paid-spin payout, not only its mean. σ, hit frequency, LDW rate, the effect
of the cap and the probability of the max win then all follow exactly.

### 5.1 Base game: exact enumeration

- **The mean factorises per line.** With independent uniform stops, the symbols that one line
  reads have independent marginals, one per reel, equal to the strip frequencies. A line's
  expected pay is a sum over prefix patterns of products of per-reel probabilities, wild
  rules included, and RTP is the sum over lines by linearity. This costs microseconds and
  should be a unit test of its own.
- **The distribution and σ need the joint grid**, because lines share symbols. Enumerate the
  combinations of **distinct windows** per reel with their multiplicities (a reel of length L
  has at most L distinct windows, usually fewer). With 5 reels of about 60 stops that is up to
  about 8·10⁸ combinations, a few minutes in Node. That is fine for a CI job or a
  `npm run analyse` script, but not for every unit-test run. Toy configurations with strips of
  5–10 stops enumerate in milliseconds and carry the unit tests.
- **Ways games** enumerate the same way. Only the evaluator changes.
- If a later design makes enumeration intractable, for example cascades or very long strips,
  the fallback is a dynamic programme over reels. Simulation is never the fallback, because a
  simulated value cannot be labelled theoretical.

### 5.2 Trick ladder: absorbing Markov chain

A trick ladder is a small absorbing Markov chain. Transient states are "about to attempt rung
k" (plus any multiplier or bank state). Absorbing states are "bailed after landing j rungs"
and "landed the top rung". With transient-to-transient matrix Q and transient-to-absorbing
matrix R, the fundamental matrix is N = (I − Q)⁻¹, the absorption probabilities are B = N·R,
and with payout vector v:

```text
E[trick pay]   = B[start] · v
E[trick pay^2] = B[start] · v^2        (for σ and the distribution)
```

For the plain "keep what you landed" ladder this reduces to a closed form:
E = Σₖ (Π_{i≤k} pᵢ) · (bankₖ − bankₖ₋₁).

**Worked example**, checked numerically on 2026-11-25 (`.scratch/math-targets/ladder.py`).
Four rungs with landing probabilities 0.70 / 0.55 / 0.40 / 0.25 and banks 0.5 / 1.5 / 4 / 12x
bet:

| Ends with | Probability |
|---|---|
| Bail on rung 1 (pays 0) | 0.3000 |
| Bail on rung 2 (pays 0.5) | 0.3150 |
| Bail on rung 3 (pays 1.5) | 0.2310 |
| Bail on rung 4 (pays 4) | 0.1155 |
| Lands all four (pays 12) | 0.0385 |

That gives E = 1.428x and SD = 2.44x. A seeded simulation of 2,000,000 ladders gave 1.4284
with SE 0.0017 (z = 0.23). At a trigger of 1 in 11 spins this ladder is 13% of RTP, which is
where the starting split in section 3 comes from. 70% of tricks end in a bail, so the Folk
Valley moment is the common case, as the theme wants.

Rules that keep this tractable and honest:

- **Feature probabilities are integer weights** (for example "land: 55 of 100") drawn with
  an exact `nextInt(total)`. The analyser then works in exact rationals, or float64 with a
  stated error bound, and the configured probability is exactly the one the engine uses.
  Floating-point probabilities like `0.55` from `nextFloat() < p` are rejected by validation.
- The whole ladder (every attempt and its land or bail) is drawn by the engine before
  anything is shown (rule 4). The animation plays a known sequence.

### 5.3 Bonus: dynamic programme over its state

Free spins with a rising multiplier, retriggers and a cap are a dynamic programme over
(spins remaining, multiplier or ladder state, retriggers used). Per-spin outcome
distributions come from the bonus strips by the enumeration in 5.1. Two shortcuts that must
not be taken silently:

- E[total] = E[spins] × E[per-spin pay] holds **only** if spins are identical and carry no
  state. A multiplier that grows on wins breaks it.
- A retrigger rule needs either a finite cap on awarded spins or a proof that expected spins
  are finite. For "each spin retriggers with probability r adding m spins", this is r·m < 1,
  giving E[spins] = N / (1 − r·m) without a cap. With a cap, the DP handles it exactly.

To get the distribution (for σ and the max-win cap), the DP carries accumulated payout in
integer units of the line bet, truncated at the cap. Its size is about
spins × multiplier states × (cap in units). At a 2,500x cap that is around 10⁷–10⁸ state
updates, an offline job rather than a unit test, and milestone 2 should measure it. If it is
too slow, the fallback is to compute the mean exactly without the cap and bound the cap's
effect by E[(X − cap)⁺], computed from the tail. The page then states that bound instead of
an exact figure.

### 5.4 If there is persistent cross-spin state

A meter that carries across spins (for example "five bails fill the meter and start the bonus")
makes the game a Markov chain over meter states s. The long-run RTP is
Σₛ π(s) · E[return | s], where π is the chain's stationary distribution. The analyser can
compute this exactly, but it has consequences the owner should weigh (section 10):

- RTP **depends on the state you start in**. A player who arrives at a nearly full meter
  plays a better game, and that is exactly the "it's due" intuition the simulator is meant to
  debunk.
- "1 in N" frequencies become long-run rates, and the panel has to say so.

Recommendation: avoid persistent state, or keep it visible, small and in the analyser.

### 5.5 If the player can choose

If the player may "bank or push" on a ladder, the engine still pre-draws the whole ladder
before anything is shown, and the choice only selects how far along it the player goes. RTP
then depends on strategy. Either every choice is **EV-neutral** (pushing has the same
expected value as banking, so RTP is strategy-free and only variance changes), or the panel
shows the RTP of the default strategy and of the best one. Recommendation: EV-neutral or no
choice in v1. "Skill" that does not change odds is a misconception worth teaching, not
building in.

## 6. Verifying it by simulation

Simulation does not produce the theoretical RTP. It checks that the **engine** (what the
player sees) and the **analyser** (what the math says) describe the same game.

### 6.1 The arithmetic

Standard error of an observed RTP is SE = σ / √N, where N is paid spins:

| σ (x bet) | 10⁵ spins | 10⁶ | 10⁷ | 10⁸ | 10⁹ |
|---|---|---|---|---|---|
| 2 (base game only) | 0.63 pp | 0.20 | 0.063 | 0.020 | 0.006 |
| 6 (proposed full game) | 1.90 pp | 0.60 | 0.19 | 0.060 | 0.019 |
| 10 (Defuse Protocol) | 3.16 pp | 1.00 | 0.32 | 0.10 | 0.032 |

Confirming the full game's RTP to ±0.1 pp at σ = 6 takes about 3.6·10⁷ spins for 1 SE, and
about 6·10⁸ for a 4-SE test. A 200,000-spin run, which is what Defuse Protocol published, has
an SE near 2 pp and cannot tell 96% from 94%.

### 6.2 What the tests assert

Testing the whole game alone is too blunt, so the verification is split into pieces that each
have a small σ:

| Test | What runs | Compared with | Notes |
|---|---|---|---|
| **Hand fixtures** | Specific grids and ladders | Hand-calculated pays | The only defence against a bug that engine and analyser share, if they share the evaluator |
| **Toy exact** | Every stop combination of a tiny config through the engine | Analyser's exact RTP and distribution | Exact equality, no tolerance |
| **Engine vs analyser, same stops** | Engine spins with recorded stops and draws | Analyser's evaluation of those stops | Payout equal on every spin. This catches presentation-path or state bugs |
| **Base game only** | 10⁷ base spins, features off | Exact base RTP | σ ≈ 2, so 4 SE ≈ 0.25 pp |
| **Trick feature only** | 10⁶ forced ladders | Markov mean and SD | SE about 0.2% of the mean |
| **Bonus only** | 10⁵ forced bonuses | DP mean | Conditional SD of 50x gives SE ≈ 0.16x on 42x |
| **Trigger frequencies** | Counts from the base-only run | Exact probabilities | Binomial SE; also a χ² goodness-of-fit over outcome classes (symbol × length, scatter counts, ladder endings) |
| **Full game** | 10⁷ paid spins in CI; 10⁸–10⁹ in an occasional long job | Analyser's total | Catches a wrong attribution or wiring between parts |

**Tolerance.** Each tolerance test asserts |observed − theoretical| ≤ 4 · SE, with
SE = σ_theoretical / √N. It uses the analyser's σ, not the sample SD, because in a skewed,
heavy-tailed distribution the sample SD tends to come out low and would make the test
falsely strict, or worse, falsely loose. With a fixed seed the test is deterministic (always
passes or always fails), so 4 SE is not about flakiness. It is chosen so that a correct engine
passes for almost every seed (two-sided false-alarm rate about 6·10⁻⁵), which means changing
the recorded seed never turns a correct build red. The cost is sensitivity: a bias smaller
than about 4 SE goes unnoticed, which is why the exact and fixture tests carry most of the
weight.

**Seed sweep.** An occasional job runs K = 20–50 independent seeds and checks the z-scores
as a set: their mean near 0 (within about 4/√K) and their variance near 1 (χ²). A biased
engine shifts the mean, and a wrong σ shows up as a variance far from 1. Both are invisible
in a single run.

### 6.3 Seed policy

- CI seeds are fixed constants in the test files, recorded in [`findings.md`](../findings.md)
  with every published run, together with N, SE, configuration hash, engine version and PRNG
  identifier.
- **No seed shopping.** A seed is never changed to make a test pass. A failing seed is a
  finding to investigate, and the investigation is recorded.
- Seed sweeps use seeds derived from a recorded base, for example `sweep-2026-11-25-00`…`19`,
  so they are reproducible but not hand-picked.
- Any comparison of two configurations uses the same seeds for both arms (a control arm,
  [`PLAN.md`](../PLAN.md) section 4). Common random numbers also reduce the noise of the
  difference.

## 7. What the statistics panel shows

Two clearly separated groups. The words "theoretical" and "observed" (or "simulated") are in
every label, and an observed RTP is never shown as plain "RTP".

**Theoretical: from the math model, the same for everyone with this configuration**

- Theoretical RTP, and its split: base wins / trick feature / bonus
- Hit frequency, win-above-bet frequency, LDW frequency
- σ per paid spin, and the volatility class with its thresholds
- Bonus: 1 in N paid spins. Trick feature: 1 in N. Per-rung landing probabilities
- Max-win cap, and the probability of reaching it ("about 1 in 20 million")
- **Expected range after N spins** (for example 100 / 1,000 / 10,000): the band within which
  95% of sessions' RTP falls. For large N it is 96% ± 1.96σ/√N and is labelled as a normal
  approximation. For small N it is skewed and badly approximated, so the panel uses simulated
  percentiles from the worker, labelled "simulated".

**Observed: this session, or this simulation run**

- Paid spins, total wagered, total paid, net
- Observed RTP with its SE and 95% interval, and how far it is from the theoretical value
  in SE ("0.8 standard errors above"). This teaches that a session's swing is normal
- Observed hit, win-above-bet and LDW rates
- Bonuses triggered and the observed rate; tricks attempted, landed and bailed
- Largest win, labelled "largest observed", never as the max win
- Longest run without a payout
- For simulations: seed, N, configuration hash, engine and PRNG version

## 8. The engine's RNG

| Requirement | Proposal |
|---|---|
| **Algorithm** | `xoshiro128**`: 128-bit state, period 2¹²⁸ − 1, passes BigCrush, and uses only 32-bit integer operations (`Math.imul`, shifts, rotates), so it is fast in plain JS. PCG32 is equally good statistically, but needs a 64-bit multiply, which in JS means BigInt or 16-bit limb emulation and is several times slower. |
| **Seeding** | A 64-bit master seed (canonical form: 16 lowercase hex digits). Text seeds are hashed by a versioned function. The 128-bit state is filled by a SplitMix-style mixing function, which never produces the all-zero state xoshiro forbids. |
| **One stream per paid spin** | Spin *i*'s generator is seeded from hash(master seed, i), so every paid spin is a pure function of (configuration, master seed, i, bet, pre-spin state). Three things follow: a feature's draws never shift later spins (Defuse Protocol's single shared stream did); any spin replays alone; and a worker pool splits a run by index ranges and gets bit-identical results to a single thread. |
| **Integers in a range** | `nextInt(n)` by rejection: reject r ≥ 2³² − (2³² mod n), return r mod n. This is exactly uniform. Lemire's multiply-shift method needs a 64-bit product, which a double cannot hold exactly, so plain rejection is simpler and correct. Every probability is an integer weight drawn this way. |
| **Floats** | Not used for outcomes. If ever needed for a non-outcome purpose: 53 bits from two draws. |
| **Reproducibility** | The algorithm has a versioned identifier (`xoshiro128ss-v1`), golden-vector tests pin its first outputs for fixed seeds and the per-spin derivation, and a golden full-spin test pins whole results. Changing any of them is a new version, not an edit. `Math.random()`, time and frame timing never reach the engine. |
| **Labelling** | Statistically good and reproducible, but not cryptographic or certified. It is fit for an educational simulator and is described that way. |

## 9. From Defuse Protocol: keep and avoid

Defuse Protocol's documents (`docs/math-model.md`, `docs/tuning-report.md` in
`C:\My programs\my-casino-slot`) are a reference, not a template.

**Worth keeping**

- Theoretical and observed labels on every figure, and "largest observed ≠ max win".
- Every feature payout is attributed to the paid spin that triggered it, and feature spins
  are not paid spins.
- Bonus probability computed from whole visible windows, not symbol counts.
- Validation that rejects bad configuration with structured errors and never clamps or
  rewrites it silently.
- Unbiased `nextInt` by rejection sampling (its `rng.ts` does this correctly).
- "Any payout" and "payout above the wager" kept as two separate rates.

**Worth avoiding**

- **No theoretical total RTP.** Only the base game (29.3%) was computed exactly. The "96%"
  target was checked by 200,000-spin simulations with an SE of about 2.2 pp, so it was never
  verified. Here, the analyser covers the features before any target is claimed.
- **Feature-heavy split.** The base game returned 29% and the bonus 67%. That is very swingy
  and leaves the base game nearly dead. The proposal here keeps about 55% in base wins.
- **High LDW rate.** It had a 45% hit rate, but only 7% of spins paid more than the wager, so
  about 38% of all spins were losses presented as wins.
- **`mulberry32`.** 32-bit state with a 2³² period; a few billion draws exhausts it, it has
  known statistical weaknesses, and parallel streams would overlap.
- **One shared stream for the whole session**, so the bonus route chosen changed every later
  base spin. The tuning report had to explain the resulting discrepancies away.
- **Two routes with unproven equal value**, with 96.7% vs 94.6% observed, a gap within noise.
  If routes are offered, the analyser proves their RTP.
- **Single-seed tuning against a target band**, judged by observed rates. That is how seed
  shopping starts.

## 10. Open questions for the owner

1. **RTP.** Is 96% right, or should the simulator also ship a lower-RTP version of the same
   game (for example 88%) to show how RTP versions work in the real industry?
2. **Volatility.** Medium (σ 4–7) as proposed, or medium-high for bigger, rarer wins?
3. **Max-win cap.** 2,500x bet as proposed, or something else? A higher cap means a rarer,
   bigger headline win and a larger σ.
4. **Persistent state.** May bails fill a meter across spins? It is thematic, but makes RTP
   depend on the starting state (section 5.4).
5. **Player choice.** Can the player choose to bank or push on a trick ladder? The proposal is
   no choice, or EV-neutral choices only (section 5.5).
6. **Do bails pay anything?** A small consolation pay softens bails, but adds LDWs.
7. **Bet levels.** The same RTP and config at every bet level is assumed; please confirm.
8. **Bonus buy.** A virtual-credit "buy the bonus" option changes RTP accounting and should be
   ruled out or in explicitly. The proposal leaves it out.
9. **CI budget.** How many minutes may the simulation and enumeration jobs take on each push,
   compared with a nightly or manual run?

## Proposed decision record

### DR-0xx — Math targets and how they are verified

*(Number assigned by the lead session.)*

- **Status:** proposed, 2026-11-25
- **Context:** Folk Valley teaches how slot math works, so its numbers have to be realistic,
  provable and verifiably matched by the engine. Rules 4–6 in `AGENTS.md` require RTP to come
  only from the configuration and statistics to be labelled honestly. The sibling Defuse
  Protocol published a 96% target that was never computed, only sampled with an SE near
  2 pp, and its RTP was 67% bonus. The mechanics are not final, so the targets must hold for a
  trick ladder in ordinary spins and a bonus of the likely shapes.
- **Decision:**
  - Theoretical RTP 96.0% (±0.05 pp from the exact analyser), the same at every bet level.
  - Medium volatility: σ 4–7x bet per paid spin, using the project's class thresholds
    (low < 3, medium 3–7, medium-high 7–12, high > 12). Hit frequency 28–35%, win-above-bet
    at least 12%, LDWs reported and at most half of hits.
  - A max-win cap of 2,500x bet on the whole paid spin, modelled by the analyser.
  - Starting split: base wins 55%, trick feature 13%, bonus 28%. Bonus about 1 in 150 paid
    spins (120–200); trick feature about 1 in 8–12.
  - A pure-TypeScript analyser computes every theoretical figure: exact distinct-window
    enumeration for the base game, an absorbing Markov chain for trick ladders, and a DP for
    the bonus. It produces the payout distribution, not only the mean. Feature probabilities
    are integer weights. No theoretical figure ever comes from simulation.
  - Verification is split into components: hand fixtures, exact toy enumeration,
    engine-vs-analyser equality on the same stops, and component simulations (base,
    trick, bonus, frequencies). Each tolerance test asserts |obs − theo| ≤ 4·σ_theo/√N with a
    fixed, recorded seed, and an occasional multi-seed sweep checks the z-score distribution.
    There is no seed shopping.
  - RNG: `xoshiro128**` with versioned SplitMix-style seeding from a 64-bit master seed, one
    derived stream per paid spin, rejection-sampled `nextInt`, and golden-vector tests.
  - The statistics panel separates theoretical from observed figures as listed in
    `docs/research/math-targets.md` section 7.
- **Alternatives:**
  - RTP 92–94%, nearer land-based machines. It shows the edge faster, but is less
    representative of the online figure people know, and remains an option as a second RTP
    version.
  - High volatility. It is dramatic, but means long dry stretches at a 1-in-150 bonus.
  - Verifying RTP by simulation alone, as Defuse Protocol did. Rejected: at σ ≈ 6, ±0.1 pp
    needs hundreds of millions of spins, and a simulated value is not theoretical.
  - `mulberry32`. Rejected for its 2³² period and weaker statistics. PCG32 is equivalent in
    quality but slower in JS.
  - One sequential stream per session. Rejected because features shift later spins and
    parallel simulation cannot match a single thread.
- **Consequences:** The analyser is real milestone-2 work, about as large as the evaluator, and
  every mechanic the sibling designs has to be analysable (a Markov chain or a DP with a
  bounded state). That constraint is intended. Full-grid enumeration and the capped bonus DP
  are minutes-long jobs, so they run outside the unit-test loop, which needs a CI budget
  decision. Persistent cross-spin state or EV-changing player choices, if adopted, need their
  own record because they change what "RTP" means. The targets are revisited when the
  mechanics decision record is accepted.
