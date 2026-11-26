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

## [0.0.0] - 2026-10-18

### Added
- The project skeleton.
