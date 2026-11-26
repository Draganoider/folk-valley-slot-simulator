# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the version stays `0.x`, anything may change in any release.

## [Unreleased]

### Added
- The engine foundation: a seeded `xoshiro128**` RNG with one stream per paid spin, the
  game configuration with its validator, an untuned placeholder configuration, and the spin
  result format, with unit tests and an `Engine` CI workflow.
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
