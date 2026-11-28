# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version stays `0.x`, anything may change in any release.

## [Unreleased]

## [0.3.0] - 2026-11-27

### Added
- A playable prototype in the browser: a React and Vite app with a PixiJS reel scene in
  placeholder art, a virtual balance with a reset, bet levels, a seed field, and the Scar
  Card and gore setting saved in the browser (DR-009, DR-010). It plays with storage blocked.
- The presentation timeline (DR-014): each spin's result becomes a timed list of events,
  played on a clock, so turbo is a speed and skip a seek. Reels stop one by one, wins and
  the Kicker's wild reel light up, tricks land or bail with a cut-away on impact, injury and
  patch-up cards follow, and the Session plays its free spins before the win counts up.
  Reduced motion keeps every information beat, and Mild gore hides the broken card.
- The statistics panel: theoretical figures from the analyser, your own session's observed
  figures, and simulated runs of up to a million spins in Web Workers, kept in separate,
  labelled sections with plain-language explanations of RTP, volatility, hit frequency and
  losses disguised as wins.
- Browser tests in CI, and the animation spike that settled riders as cut-out rigs with
  painted held frames after the cut-away (DR-015).

### Fixed
- The observed RTP's 95% interval is shown only from 1,000 spins and never below 0%; after
  25 spins it had read "-28% to 555%".

## [0.2.0] - 2026-11-25

### Added
- The engine foundation: a seeded `xoshiro128**` RNG with one stream per paid spin, the
  game configuration with its validator, an untuned placeholder configuration, and the spin
  result format, with unit tests and an `Engine` CI workflow.
- The game design (milestone 1): research on mechanics, math targets, rendering and art
  direction in `docs/research/`, and decision records DR-005 to DR-010, including realistic
  injuries behind a gore setting that defaults to Full (DR-009).
- The 243-ways base-game evaluator, with the Kicker wild on reels 2–4 and the Flyer count,
  plus a fast profile form that the analyser reuses.
- The simulation runner: streaming, mergeable statistics labelled as observed, Web Workers
  whose split runs equal a single thread exactly, and `npm run simulate` for Node.
- The trick feature, the per-bet Scar Card and the trick-ladder Session, wired into a full
  `spin()` with the 2,500× cap; the draw order and the card-and-Flyers rule are DR-012.
- The exact analyser: every theoretical figure (RTP and its split, σ, hit, win-above-bet and
  LDW rates, feature rates, the cap and the payout distribution) computed from the
  configuration, never simulated, with exact fractions where cheap and a stated float bound
  elsewhere; `npm run analyse`.
- The tuned configuration `folk-valley-96-v1` (DR-013): theoretical RTP 95.997%, σ 5.72×
  bet, hit frequency 31.2%, a trick 1 in 9.5 spins and a Session 1 in 141. `npm run
  simulate` plays it by default.
- Verification against the analyser: an exact toy enumeration through the real spin,
  same-stops checks, short seeded runs in the unit tests, and a nightly workflow with brute
  force over the base game and 10⁸ simulated spins (`npm run verify:long`).

## [0.0.0] - 2026-10-18

### Added
- The project skeleton.
