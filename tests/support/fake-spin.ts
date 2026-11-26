import {
  INJURY_CATALOGUE,
  RESULT_FORMAT_VERSION,
  RNG_VERSION,
  TRICK_TIER_IDS,
  maxWinCoins,
  parseSeed,
  scarCardMarks,
  spinStreams,
  withScarCardMarks,
} from '../../src/engine';
import type {
  BaseTrickAttempt,
  GameConfig,
  InjuryLevel,
  PlayerState,
  Rng,
  SessionResult,
  SessionSpin,
  SpinOutcome,
  SpinRequest,
  SpinResult,
} from '../../src/engine';

/**
 * A stand-in for `spin()` so the runner, stats and workers can be tested before the real one
 * lands. Deterministic from (seed, spin index, card before), drawing from the spin's own
 * outcome stream as the real spin will, and it **uses the Scar Card**: a bail adds a mark,
 * and a full card starts a Session. So a run's results depend on the state carried between
 * spins, which is what makes lane-boundary splitting worth testing.
 *
 * Its numbers mean nothing; it only exercises every field the stats read: nothing paid,
 * losses disguised as wins, even money, big wins, trick attempts of every tier landing and
 * bailing, Flyer and Scar Card Sessions of varied length and multiplier, and the cap.
 */
export function spin(config: GameConfig, state: PlayerState, request: SpinRequest): SpinOutcome {
  const { outcome } = spinStreams(parseSeed(request.masterSeed), request.spinIndex);
  const cost = config.bet.coinsPerSpin;
  const before = scarCardMarks(config, state, request.betLevel);
  const size = config.scarCard.size;

  let attempt: BaseTrickAttempt | null = null;
  if (outcome.nextInt(4) === 0) {
    const tier = TRICK_TIER_IDS[outcome.nextInt(3)] as (typeof TRICK_TIER_IDS)[number];
    const landed = outcome.nextInt(2) === 0;
    attempt = {
      rider: 'kerb',
      tier,
      kicker: { reel: 1, row: 0 },
      trickId: 'fake',
      outcome: landed ? 'landed' : 'bailed',
      wildReels: landed ? [1] : [],
      winMultiplier: landed ? 2 : 1,
      bail: landed ? null : bail('scuffed'),
    };
  }

  const r = outcome.nextInt(100);
  let baseWin =
    r < 60 ? 0 : r < 75 ? Math.floor(cost / 2) : r < 80 ? cost : r < 95 ? cost * (1 + outcome.nextInt(4)) : cost * (5 + outcome.nextInt(50));
  if (attempt?.outcome === 'landed') baseWin *= 2;

  const flyers = outcome.nextInt(40) === 0 ? 3 + outcome.nextInt(3) : outcome.nextInt(3);
  const bailed = attempt?.outcome === 'bailed';
  const filled = bailed && before + 1 === size;
  const after = bailed ? (filled ? 0 : before + 1) : before;

  let session: SessionResult | null = null;
  if (flyers >= 3) session = fakeSession(outcome, cost, { kind: 'flyers', count: flyers as 3 | 4 | 5 });
  else if (filled) session = fakeSession(outcome, cost, { kind: 'scar-card' });

  const cap = maxWinCoins(config);
  const huge = outcome.nextInt(1000) === 0 ? cap : 0; // now and then, a spin that hits the cap
  const raw = baseWin + (session?.totalWinCoins ?? 0) + huge;
  const total = Math.min(raw, cap);

  const result: SpinResult = {
    formatVersion: RESULT_FORMAT_VERSION,
    rngVersion: RNG_VERSION,
    configId: config.id,
    masterSeed: request.masterSeed,
    spinIndex: request.spinIndex,
    betLevel: request.betLevel,
    costCoins: cost,
    base: {
      stops: [0, 0, 0, 0, 0],
      grid: [],
      attempt,
      flyers: { count: flyers, positions: [] },
      wins: [],
      winCoins: baseWin,
    },
    scarCard: { betLevel: request.betLevel, size, before, after, filled },
    session,
    totalWinCoins: total,
    capped: raw >= cap,
  };
  return { result, state: withScarCardMarks(state, request.betLevel, after) };
}

function bail(level: InjuryLevel): { animationId: string; injury: { level: InjuryLevel; id: string } } {
  return { animationId: 'fake', injury: { level, id: INJURY_CATALOGUE[level][0] as string } };
}

function fakeSession(rng: Rng, cost: number, trigger: SessionResult['trigger']): SessionResult {
  const length = 1 + rng.nextInt(8);
  const spins: SessionSpin[] = [];
  let pain = 0;
  let rung = 0;
  let total = 0;
  for (let i = 0; i < length; i++) {
    const landed = rng.nextInt(3) !== 0;
    const ladderBefore = { rung, multiplier: rung + 1, pain };
    if (landed) rung = Math.min(rung + 1, 4);
    else pain += 1;
    const ladderAfter = { rung, multiplier: rung + 1, pain };
    const win = cost * rng.nextInt(6) * ladderAfter.multiplier;
    total += win;
    const level: InjuryLevel = pain >= 3 ? 'broken' : pain === 2 ? 'bleeding' : 'scuffed';
    spins.push({
      index: i,
      stops: [0, 0, 0, 0, 0],
      grid: [],
      attempt: { rider: 'dot', rung: ladderBefore.rung, trickId: 'fake', outcome: landed ? 'landed' : 'bailed', bail: landed ? null : bail(level) },
      ladderBefore,
      ladderAfter,
      spinsLeftBefore: length - i,
      spinsAdded: 0,
      spinsLeftAfter: length - i - 1,
      wins: [],
      winCoins: win,
      runningTotalCoins: total,
    });
    if (pain >= 3) break;
  }
  return {
    trigger,
    rider: 'dot',
    startingSpins: length,
    startRung: 0,
    spins,
    endReason: pain >= 3 ? 'pain-limit' : 'spins-out',
    closing: { level: 'patched-up', id: INJURY_CATALOGUE['patched-up'][0] as string },
    totalWinCoins: total,
  };
}
