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
