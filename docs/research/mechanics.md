# Research: game mechanics

**Status: research for milestone 1. Nothing here is implemented or accepted.** The proposed
decision record at the end goes to the lead session, which reconciles it with the math,
rendering and art research into the decision records in [`PLAN.md`](../PLAN.md).

This page proposes how Folk Valley plays: the reel layout and pay model, the symbols, how
tricks and bails work in ordinary spins, the bonus, how injuries escalate without crossing
[`AGENTS.md`](../../AGENTS.md) rule 8, and how the game explains itself honestly (rule 6). It
leaves every number (RTP, volatility, hit rate, probabilities, pays) to the math-targets
research, and lists what the mechanics need from it instead.

Commercial slots were looked at in general terms only, from common knowledge of how the
genre is built: collection meters, multiplier ladders, expanding wilds, hold-and-respin
collect features, and free spins with escalating multipliers. Nothing here copies a game's
names, art, text or exact rules.

## 1. Constraints every option has to meet

These come straight from `AGENTS.md` and filter the options below before taste does.

- **The engine decides everything first (rule 4).** A spin result contains every reel stop,
  every trick attempt, whether it lands or bails, which bail and which injury is shown, and
  every win. Presentation turns that into a timeline and cannot change any of it.
- **Exact theoretical math (rules 5 and 6).** The theoretical RTP has to come from the model,
  not from a simulation. A mechanic whose RTP can only be estimated by simulation makes the
  "theoretical beside observed" comparison weaker, so mechanics that keep exact computation
  cheap are preferred.
- **Readable.** The game is for people curious about how slots work. Every event should be
  explainable in one sentence the interface can show. The sibling project Defuse Protocol is a
  warning here: its engine reported rich per-spin events that never reached the screen, so the
  feature was more legible in the data than to the player. The result format proposed below is
  designed to be the presentation's only input, so nothing has to be reconstructed.
- **No implied skill.** A trick lands or bails at random. Nothing the player does — timing a
  tap, stopping the reels — may look like it influences the outcome.

## 2. Reel layout and pay model

### Options

| Model | How it pays | For Folk Valley |
|---|---|---|
| **Paylines** (5×3, 10–25 fixed lines) | A symbol run along a named path from reel 1 | Easiest concept to teach, but drawing 20 lines over a scene that is also showing a rider attempting a trick is cluttered. The trick animations want the board calm |
| **Ways** (5×3, 243 ways) | A symbol on adjacent reels from reel 1, in any row; ways multiply per reel | Every win is "this symbol on reels 1 to n", which reads at a glance with no line overlay. Exact RTP is a product over per-reel symbol counts, so it stays cheap to compute even with wilds |
| **Cluster pays** (6×6 or 7×7, tumbling) | Groups of touching symbols, usually with cascades | Rewards a busy grid that competes with the riders for attention. Cascades make each spin a chain of dependent board states, so exact RTP needs a far heavier calculation, and a cascade plus a trick plus an injury is a long spin to watch |

### Recommendation: 5 reels × 3 rows, 243 ways, left to right

- Wins need the same symbol (or a wild) on reels 1, 2, 3 at least, in any row; each extra
  adjacent reel extends the win. The number of ways is the product of matching positions per
  reel, and the win is paytable value × ways × the per-way bet.
- Only the longest run per symbol pays; different symbols' wins add.
- Ways keep the screen free for the trick, the sentence describing a win is short
  ("3 Kerbs on reels 1–3, 4 ways"), and the theoretical RTP of a base spin can be computed
  exactly without enumerating every stop combination.
- A 5×3 grid is the format most people recognise, which helps a teaching tool, and it leaves
  room on a phone screen for the rider.

Paylines are the fallback if the owner wants the "named line" concept on screen; nothing
below depends on ways except the win sentence.

## 3. Symbols

All names are original and are working names for the art-direction session to refine. Riders
are adults. None is based on a real rider, and no gear carries a real brand.

| Role | Symbols | Notes |
|---|---|---|
| **Riders** (4 high) | **Gramps** — veteran BMX rider, the top symbol. **Kerb** — street skater. **Zip** — scooter rider. **Dot** — flatland BMX rider | One rider per discipline plus a veteran, so all three sports appear. Riders are who attempts tricks and who gets hurt, so they need the most art |
| **Gear** (4 mid) | Helmet, Deck (skateboard), Pegs (BMX), Bars (scooter handlebars) | Recognisable silhouettes at small size; plain, unbranded |
| **Park junk** (5 low) | Bolt, Wrench, Grip Tape, Traffic Cone, Sticker Sheet (abstract, logo-free designs) | Themed objects rather than card ranks: one art set gives the game its own look, and they are cheap to draw. Card ranks are the fallback if the art budget is tight |
| **Wild** | **Kicker** — a launch ramp. Reels 2, 3 and 4 only | Substitutes for every symbol except the scatter. A Kicker is also what starts a trick attempt (section 4) |
| **Scatter** | **Session Flyer** — a hand-made poster for a park session. Any reel, at most one per reel | 3, 4 or 5 anywhere start the bonus (section 5). Pays nothing by itself in the proposal; a scatter pay is a math-session option |

Keeping the wild off reel 1 is the usual way to stop wilds making every spin a win, and keeps
the ways evaluation simple: a win always starts from a real symbol.

## 4. Tricks and bails in ordinary spins

### The attempt itself (shared by every option)

When at least one Kicker lands, one rider attempts a trick off it — the leftmost Kicker if
there are several, so there is at most one attempt per spin. The engine, after choosing the
reel stops, draws:

1. **Who rides** — one of the four riders, from fixed configured weights (independent of the
   grid, so the rule is easy to state).
2. **The trick's tier** — easy, medium or hard, from fixed weights. The trick shown (a
   tailwhip, a kickflip, a barspin…) is a cosmetic pick within the tier and rider's discipline.
   Trick names are generic sport terms, not anyone's signature move.
3. **Land or bail** — with a fixed probability per tier. Harder tricks land less often and pay
   more when they do.
4. **If it bails, how** — a cosmetic bail animation and an injury from the allowed catalogue
   for base-game bails (section 6).

What landing and bailing do depends on the option.

### Option A — Self-contained attempts, no memory between spins

- **Land:** the Kicker's reel expands to a full wild reel (easy), plus one more random reel
  among 2–4 (medium), plus a ×2 on the spin's win (hard). The win is evaluated after.
- **Bail:** the Kicker stays a single wild, and the tumbling rider leaves one extra wild on a
  random position of their reel ("the wreck").

Every paid spin is independent, so the theoretical RTP is a plain per-spin expectation and a
bet can be changed at any time without consequence. But a bail is only a smaller win now; it
feeds nothing, which misses the point that in Folk Valley the bail matters too.

### Option B — A persistent bail meter, kept per bet (recommended)

- **Land:** as in A — the Kicker's reel goes wild, more for harder tricks.
- **Bail:** the Kicker stays a single wild, and the bail adds one mark to the **Scar Card**, a
  meter of a configured length (around five marks; the number is the math session's). The
  mark is the rider's injury going on their record.
- **Full card:** the spin that adds the last mark triggers the bonus as part of that same spin
  result, and the card resets. The bonus is attributed to that paid spin for RTP.
- **One card per bet level.** Changing the bet switches to that bet's own card, so a card built
  on small bets can never pay out at a large one. Without this, a player could fill a meter
  cheaply and raise the bet just before it fills — a well-known flaw of persistent meters,
  which is why commercial games that use them usually store one per bet.
- **Cards are part of the session state,** saved with the balance and the seed, and visible at
  all times. Whether they survive a page reload is an owner question.

The meter makes a paid spin depend on the state before it, so the RTP is the long-run average
over the meter's states. With a short card this is a small Markov chain whose stationary
distribution is exact and cheap to compute, so the theoretical RTP stays exact. That is also
good teaching material: the statistics page can show how much of the RTP the card delivers and
what a part-filled card is worth on average (section 7).

### Option C — Sticky "bandaged" symbols that carry into later spins

- **Bail:** the rider's symbol stays on the reels, bandaged, as a sticky wild for the next few
  spins.

Readable and strongly themed, but it carries grid state between paid spins. That raises the
bet-switching problem in a sharper form (a sticky wild is worth more at a higher bet, and can't
be split per bet the way a counter can), makes the exact RTP depend on a much larger state
space, and shows the player a board that "looks close" on the next spins, which edges towards a
designed near-miss. Rejected.

### Recommendation

**Option B.** It is the one where a bail is real progress, which is the whole joke of the
game, while the RTP stays exactly computable and the obvious exploit is closed by keeping one
card per bet. Option A is the fallback if the math session finds the meter makes the
base-game math too volatile or the bonus too frequent; switching from B to A is a configuration
change (meter off), not a redesign.

## 5. The bonus: the Session

The bonus is a run of free spins called a **Session**, entered by 3+ Session Flyers or by a
full Scar Card. Feature reels may differ from the base reels; that is a math-session choice.

### Option 1 — Trick ladder with a pain level (recommended)

The rider works up a ladder of harder and harder tricks.

- **Start:** a configured number of free spins (around 8), ladder at rung 0 (multiplier ×1),
  pain 0. Four Flyers start one rung up and five start two rungs up, so a bigger trigger is
  visibly better without a separate feature.
- **Every free spin has exactly one attempt,** at the trick on the current rung, before the
  reels' win is counted:
  - **Land:** climb a rung; the multiplier steps up (illustratively ×1, ×2, ×3, ×5, ×8, ×10).
    Landing the top rung keeps the top multiplier for the rest of the Session.
  - **Bail:** pain +1 and the rider stays on the same rung, keeping the multiplier. At pain 1
    and 2 the rider shakes it off and the Session gains one extra spin, so a bail is progress
    of a kind. At pain 3 the rider is done for the day: the Session ends after this spin.
- **Then** the reels' ways win is multiplied by the multiplier just set, so a landed trick
  lifts the same spin's win. Kickers still act as wilds in the Session but start no extra
  attempt; the ladder is the attempt.
- **End:** when the spins run out or pain reaches 3. Every Session ends with the rider
  patched up (section 6).
- **Land probability per rung** is fixed in the configuration, falling as the rungs rise. It
  does not depend on pain, wins, balance or anything observed, so "a hard trick lands one time
  in N" is a true sentence. Making pain lower the land chance is a later option, still exactly
  computable.

Why it works: the multiplier and the pain level are two meters the player can read at once,
and each spin is one sentence ("Kerb landed a 360 flip — ×5" or "Kerb bailed — pain 2, +1
spin"). The Session is **bounded by design**: at most the starting spins plus two, no
retriggers, a multiplier with a ceiling. So the maximum win is a fixed number the rules can
state, and the expected value is a small dynamic program over (spins left, rung, pain). Because
the attempt and the reels are independent, the Session's expected win is the expected free-spin
win times the sum of the expected multipliers over the spins played: exact, not simulated.

### Option 2 — Hold-and-respin "line-up"

Riders landing during respins stick in place, each carrying a credit value; each new rider
resets the respins, and a landed trick doubles a rider's value while a bail freezes it.
A well-understood collect structure that reads clearly, but it is essentially a second game
mode with its own strips, values and evaluation, and its tricks are a side detail rather
than the centre. Its exact math needs a large state model or falls back to simulation.
Not recommended for the first version.

### Option 3 — Choose your line

Before the Session, the player picks a **mellow line** (more spins, a gentle ladder with high
land chances) or a **gnarly line** (fewer spins, a steep ladder with high multipliers and low
land chances). Both are tuned to the **same expected value** with different volatility.

This is an add-on to Option 1, not a replacement, and it is the strongest teaching moment
available: the player makes a real choice and can then see, from the statistics, that it
changed the spread of results and not the average. It costs a second ladder configuration and
a second simulation. Proposed for a later milestone, as an owner question.

### Recommendation

**Option 1, the trick ladder with a pain level,** with Option 3 kept as a later extension.

### What the engine decides up front

The Session is part of the result of the paid spin that triggered it. When that spin is
evaluated, the engine resolves the whole Session before anything is shown, and the result
records, for the trigger and for every free spin in order:

| Field | Contents |
|---|---|
| Trigger | How the Session started (Flyers ×3/4/5 or full Scar Card), starting spins, starting rung |
| Reel stops | The stop on each reel, and the resulting grid |
| Attempt | Rider, rung, trick id (cosmetic), landed or bailed |
| Bail detail | Bail animation id and injury id (both cosmetic, from the allowed catalogue) |
| Ladder state | Rung and multiplier before and after; pain before and after |
| Spins | Spins remaining before and after, and any spin added by a bail |
| Win | Each ways win (symbol, reels, ways, base value), the multiplier applied, the spin total, the running Session total |
| End | Why the Session ended (spins out, or pain 3), and the patch-up beat |
| Caps | Whether a configured maximum win was reached |

Base-game spins record the same attempt and bail fields, plus the Scar Card before and after
and the bet level it belongs to.

Rules for that result:

- **Two seeded streams.** Outcome draws (stops, rider, tier, land or bail) come from one RNG
  stream and cosmetic draws (trick name, bail animation, injury) from a second stream seeded
  from the same spin seed. Adding a new bail animation then changes no outcome, so old seeds
  replay the same wins, and the cosmetic picks are still reproducible.
- **Presentation only reads.** Skipping, turbo and slam-stop change how much of the timeline
  is shown, never what it contains. A replay of a seed shows the same Session.
- **No hidden state.** No draw depends on recent wins, the balance, the observed RTP or
  anything shown on screen.

## 6. Injury escalation within rule 8

Injuries are tied to a bounded tier, never to a running count, so there is no "after ten
bails it gets worse" path that could drift past the line.

| Tier | When | Allowed injuries (from rule 8 only) |
|---|---|---|
| 1 | Every base-game bail; Session pain 1 | Scrapes, road rash, bruises |
| 2 | Session pain 2 | Swelling, a bleeding cut, a nosebleed, a split lip |
| 3 | Session pain 3, the last bail | A knocked-out tooth, a cast, a sling or a neck brace — shown in the patch-up, not the crash |

- **The catalogue is configuration, and validation enforces it.** Each injury id belongs to a
  tier, and the configuration validator rejects an injury id that is not in the catalogue or a
  tier above 3. The catalogue itself is reviewed against rule 8 as text before any art exists.
- **The crash is quick; the aftermath is the joke.** The impact is a short beat that cuts away
  on contact. The wince, the dazed look and the patch-up are what the camera stays on. Tier 3
  shows its result (a cast, a gap-toothed grin) after the cut, never the injury happening.
- **Every bail ends okay.** The timeline always includes a patch-up beat after a bail: the
  rider gets up, thumbs up, bandage on. Every Session ends with a "patched up" closing card
  (rider in a sling or cast, grinning, or a friend handing over an ice pack). The presentation
  contract makes this beat mandatory, so it cannot be skipped by a bug or a new animation.
- **Injuries do not stack forever.** During a Session the rider shows the injuries collected so
  far, at most one per pain level; after the Session the rider is shown healed. Base-game bails
  show only tier 1 and do not accumulate.
- **Adults, not victims.** Bystanders are never hurt, and no bail is aimed at or caused by
  another person.

## 7. Honest explanation and statistics

Rule 6 applies to every figure the mechanics create, and the mechanics add a few honesty
problems that plain slots don't have.

- **The rules page states the real odds.** It lists each trick tier's land probability, each
  rung's land probability, the Scar Card length, the Session's maximum spins and the maximum
  win, all from the configuration and marked **theoretical**.
- **Observed beside theoretical.** Session statistics show how often tricks landed per tier,
  how often the Scar Card filled, and Sessions played, each beside its theoretical value and
  labelled **observed in this session**. Worker runs are labelled **simulated**, with spin
  count, standard error and seeds, as [`PLAN.md`](../PLAN.md) section 4 requires.
- **RTP broken down by source.** Base ways wins, landed-trick wilds, Sessions from Flyers and
  Sessions from the Scar Card, each as a theoretical share. A player can see that the bail
  meter is worth, say, a few percent of RTP rather than guessing.
- **Say what the meter is.** The Scar Card shows how full it is and, from the Markov model,
  the theoretical average value of its current state at this bet. The explanation is frank
  that persistent meters are a retention design: they make stopping feel like losing progress.
  Teaching that is part of the point.
- **No skill theatre.** No button or gesture is presented as helping a trick land. If slam-stop
  exists, its label says it only skips the animation.
- **No teasing.** A bail is never staged as "so close" depending on anything but the cosmetic
  stream, and the reels never stop in a way chosen to look like a near miss.
- **A win smaller than the bet is not celebrated as a win.** The win counter shows it as a net
  loss for the spin; win fanfare scales with win/bet and is silent below 1×. Disguising a loss
  as a win is one of the most misleading habits of commercial slots, and the simulator should
  show the difference rather than copy it.
- **No feature buy and no gamble (double-or-nothing) in the first version.** Both are common in
  commercial games. Even with virtual credits, buying a Session at a price would teach an
  advertisement of the feature, and a gamble step adds a decision with no educational payoff
  that the ladder doesn't already show. Both are owner questions.

## 8. What the mechanics need from the math session

Numbers are the math session's; these are the parameters the mechanics expose and the
questions they raise.

| Parameter | Used for |
|---|---|
| Base reel strips, with Kicker only on reels 2–4 and at most one Flyer per reel window | Base ways wins, attempt frequency, Flyer trigger rate |
| Feature reel strips (or "same as base") | Session spin wins |
| Paytable for 4 riders, 4 gear, 5 low symbols, 3 to 5 of a kind | Ways wins |
| Rider weights, tier weights, land probability per tier | Base-game attempts |
| Landing payoff per tier (wild reels, extra wild reel, ×2) | Base-game trick value |
| Scar Card length | Meter fill rate and its share of RTP |
| Starting spins; starting rung for 3, 4 and 5 Flyers | Session entry |
| Ladder multipliers and land probability per rung | Session value and spread |
| Pain limit (3) and spins added per bail | Session length |
| Maximum win cap, if any | Rules page, worst-case statistics |

Questions the mechanics raise for the math:

- What share of RTP should the base game, landed tricks, the Scar Card and Flyers each carry?
- How often should a Session start from each route, so a full card feels earned but not rare?
- Is the ladder's top multiplier, combined with the feature strips, within the volatility
  target, and what is the resulting maximum win?
- With the per-bet meter, is the bet-switch exploit fully closed? It should be by
  construction; the simulation can confirm it by comparing a fixed-bet player with one who
  switches bets.

Exactness check: base spins are a ways expectation per stop combination plus a finite attempt
draw; the Scar Card is a short Markov chain; the Session is a small dynamic program. All three
give exact theoretical values, so the Worker simulation is a check on the model and never its
source.

## 9. Open questions for the owner

1. **Ways or paylines?** Ways is recommended for a calmer screen; lines teach the "line" idea
   explicitly.
2. **Should a bail feed a persistent meter (Scar Card), or stay self-contained?** The meter is
   recommended; it means the game remembers progress between spins, per bet.
3. **Should the Scar Card survive a page reload,** or reset with each visit?
4. **Choose-your-line in the Session** (mellow vs gnarly, same average) — worth adding in a
   later milestone?
5. **Feature buy and gamble step:** out of the first version, as proposed?
6. **Rider line-up:** are four riders (veteran BMX, street skater, scooter, flatland BMX) the
   right mix, and should any be based on a friend's nickname, with their consent?
7. **How funny is the patch-up?** Grinning-in-a-cast is proposed. Is a friend filming the bail
   on a phone in or out (it is the Folk Valley joke, but it makes the scene about the fail
   video)?

## 10. Proposed decision record

The lead session assigns the number when it records this in [`PLAN.md`](../PLAN.md).

### DR-NNN — Ways pays, Kicker tricks with a per-bet Scar Card, and a trick-ladder Session

- **Status:** proposed, 2026-11-25
- **Context:** Folk Valley's identity is the trick that sometimes ends in a bail, so tricks
  have to be a mechanic, not decoration, and a bail has to matter as much as a landing. The
  engine must decide every attempt before it is shown (rule 4), the theoretical RTP must come
  from the model (rules 5 and 6), injuries must stay within rule 8, and the game is a teaching
  tool, so every event needs a one-sentence explanation.
- **Decision:** A 5×3 grid paying 243 ways left to right. Four rider, four gear and five
  low symbols, a Kicker wild on reels 2–4 and a Session Flyer scatter. A spin with a Kicker
  starts one trick attempt with a rider, tier and land-or-bail drawn by the engine after the
  stops; a landed trick turns the Kicker's reel (and more, for harder tricks) wild, and a bail
  adds a mark to a Scar Card kept separately for each bet level. Three or more Flyers, or a full
  card, start a Session of free spins with one attempt per spin up a trick ladder: a landing
  climbs a rung and raises the multiplier; a bail raises pain, adds a spin at pain 1 and 2,
  and ends the Session at pain 3. The whole Session is resolved with the triggering spin.
  Outcome and cosmetic draws use separate seeded streams. Injuries come from a three-tier
  catalogue drawn only from rule 8, validated in configuration, and every bail ends with a
  mandatory patch-up beat. No feature buy and no gamble step.
- **Alternatives:** Paylines, kept as the fallback if the named-line concept should be on
  screen. Cluster pays with cascades, rejected for a busy grid and costly exact math.
  Self-contained attempts with no meter, the fallback if the meter does not fit the math
  targets, rejected as the default because a bail would then feed nothing. Sticky bandaged
  symbols, rejected for carrying grid state between spins, sharpening the bet-switch exploit and
  edging towards designed near-misses. A hold-and-respin bonus, rejected for the first version
  as a second game mode. A mellow-or-gnarly line choice, deferred as a later extension.
- **Consequences:** The engine carries one piece of state between paid spins, the Scar Card per
  bet, so the theoretical RTP is computed over the card's stationary distribution and the
  statistics show the card's share of it. The Session is bounded (starting spins plus two, a
  ceiling multiplier), so its maximum win is a stated number. The result format records every
  attempt, bail, injury and ladder step, and is the presentation's only input. The art budget
  centres on four riders, their tricks and three injury tiers. Revisit if the math session
  cannot meet its volatility target with the ladder, or if playtests show the meter reads as
  pressure rather than progress.
