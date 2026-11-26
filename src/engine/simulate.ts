import type { GameConfig } from './config';
import type { SpinOutcome, SpinRequest } from './spin';
import type { PlayerState } from './state';
import { initialPlayerState } from './state';
import { formatSeed, parseSeed } from './rng';
import type { SimulationStats } from './stats';
import { StatsAccumulator, emptyStats, mergeStats } from './stats';

/**
 * The simulation runner: N paid spins from a master seed, folded into {@link SimulationStats}.
 * Pure: it takes the spin function as a parameter, so the Web Worker, the Node CLI and the
 * tests run the same loop, the tests with a fake spin.
 *
 * **Lanes, and why a run is split at their boundaries.** A paid spin depends on the Scar
 * Card before it (`PlayerState`), and the card depends on every earlier spin, so a chunk of
 * spins cannot start in the middle of a run without first playing everything before it.
 * Each spin's random numbers are independent (DR-011), but its state is not. A run is
 * therefore made of *lanes* of `laneLength` paid spins: at every spin index that is a
 * multiple of `laneLength` the card is reset to empty, as if a new player sat down. Inside a
 * lane spins run in order with the card carried over, exactly as in play. Splitting a run
 * only at lane boundaries ({@link splitJob}) gives every chunk the exact state the single
 * thread would have there, so the merged result equals the single-thread run exactly.
 *
 * With `laneLength: null` the run is one lane: exact stationary play, but one thread. Long
 * lanes keep the bias from starting each lane on an empty card small; it is a transient of
 * about a card's worth of bails per lane, and the runner never corrects for it.
 */

/** `spin` from `spin.ts`, or a stand-in with the same contract in tests. */
export type SpinFunction = (config: GameConfig, state: PlayerState, request: SpinRequest) => SpinOutcome;

export interface SimulationJob {
  /** Canonical 16-digit lowercase hex. */
  readonly masterSeed: string;
  /** The first paid spin's index. */
  readonly startIndex: number;
  /** Paid spins to play. */
  readonly count: number;
  /** One of `config.bet.levels`. Every spin of a run is at this level. */
  readonly betLevel: number;
  /** The card resets to empty at every multiple of this index; null for one lane. */
  readonly laneLength: number | null;
  /** The state before the first spin; null for every card empty. */
  readonly initialState: PlayerState | null;
}

export interface SimulationOutcome {
  readonly job: SimulationJob;
  /** Spins played: `job.count` unless cancelled. */
  readonly completed: number;
  readonly cancelled: boolean;
  readonly stats: SimulationStats;
  /** The state after the last spin played. */
  readonly endState: PlayerState;
}

/** Checks a job against a configuration, throwing with the reason. */
export function checkJob(config: GameConfig, job: SimulationJob): void {
  if (formatSeed(parseSeed(job.masterSeed)) !== job.masterSeed) {
    throw new RangeError(`A job's seed is canonical, 16 lowercase hex digits; got "${job.masterSeed}".`);
  }
  if (!Number.isSafeInteger(job.startIndex) || job.startIndex < 0) {
    throw new RangeError(`startIndex is a non-negative integer; got ${job.startIndex}.`);
  }
  if (!Number.isSafeInteger(job.count) || job.count < 0 || !Number.isSafeInteger(job.startIndex + job.count)) {
    throw new RangeError(`count is a non-negative integer; got ${job.count}.`);
  }
  if (!config.bet.levels.includes(job.betLevel)) {
    throw new RangeError(`Bet level ${job.betLevel} is not one of ${config.bet.levels.join(', ')}.`);
  }
  if (job.laneLength !== null && (!Number.isSafeInteger(job.laneLength) || job.laneLength < 1)) {
    throw new RangeError(`laneLength is a positive integer or null; got ${job.laneLength}.`);
  }
}

/** A run that the caller drives in steps, so a Worker can answer messages between them. */
export class Simulation {
  private readonly acc = new StatsAccumulator();
  private state: PlayerState;
  private next: number;
  private readonly end: number;
  private readonly empty: PlayerState;

  constructor(
    private readonly spin: SpinFunction,
    private readonly config: GameConfig,
    readonly job: SimulationJob,
  ) {
    checkJob(config, job);
    this.empty = initialPlayerState(config);
    this.state = job.initialState ?? this.empty;
    this.next = job.startIndex;
    this.end = job.startIndex + job.count;
  }

  /** Spins played so far. */
  get completed(): number {
    return this.next - this.job.startIndex;
  }

  get done(): boolean {
    return this.next >= this.end;
  }

  /** Plays up to `maxSpins` more spins; returns true once the run is complete. */
  step(maxSpins: number): boolean {
    const stop = Math.min(this.end, this.next + Math.max(0, Math.floor(maxSpins)));
    const { masterSeed, betLevel, laneLength } = this.job;
    for (let i = this.next; i < stop; i++) {
      if (laneLength !== null && i % laneLength === 0 && i !== this.job.startIndex) this.state = this.empty;
      const { result, state } = this.spin(this.config, this.state, { masterSeed, spinIndex: i, betLevel });
      if (result.spinIndex !== i || result.masterSeed !== masterSeed) {
        throw new Error(`Asked for spin ${i} of ${masterSeed}; got spin ${result.spinIndex} of ${result.masterSeed}.`);
      }
      this.acc.add(result);
      this.state = state;
    }
    this.next = stop;
    return this.done;
  }

  /** The outcome so far; `cancelled` marks a run stopped before its end. */
  outcome(cancelled = false): SimulationOutcome {
    return {
      job: this.job,
      completed: this.completed,
      cancelled: cancelled && !this.done,
      stats: this.acc.snapshot(),
      endState: this.state,
    };
  }
}

export interface RunOptions {
  /** Called after every `progressEvery` spins and at the end. */
  readonly onProgress?: (completed: number, count: number) => void;
  readonly progressEvery?: number;
  /** Polled between steps; true stops the run with what has been played. */
  readonly isCancelled?: () => boolean;
}

/** Runs a whole job on this thread. */
export function runSimulation(
  spin: SpinFunction,
  config: GameConfig,
  job: SimulationJob,
  options: RunOptions = {},
): SimulationOutcome {
  const sim = new Simulation(spin, config, job);
  const every = Math.max(1, options.progressEvery ?? 10_000);
  while (!sim.done) {
    if (options.isCancelled?.() === true) return sim.outcome(true);
    sim.step(every);
    options.onProgress?.(sim.completed, job.count);
  }
  return sim.outcome();
}

/**
 * Divides a job into at most `parts` consecutive chunks, each starting on a lane boundary
 * (see the top of this file): every cut is the boundary nearest an equal share of the
 * spins, so chunks differ in size by about a lane at most. Merging the chunks' outcomes in
 * order with {@link mergeOutcomes} gives exactly the single-thread outcome. A one-lane job
 * (`laneLength: null`), or one with no boundary inside it, is one chunk.
 */
export function splitJob(job: SimulationJob, parts: number): SimulationJob[] {
  if (!Number.isSafeInteger(parts) || parts < 1) throw new RangeError(`parts is a positive integer; got ${parts}.`);
  const lane = job.laneLength;
  const start = job.startIndex;
  const end = start + job.count;
  if (lane === null) return [job];
  const cuts: number[] = [];
  for (let k = 1; k < parts; k++) {
    const ideal = start + Math.round((k * job.count) / parts);
    const cut = Math.round(ideal / lane) * lane;
    if (cut > start && cut < end && cut !== cuts[cuts.length - 1]) cuts.push(cut);
  }
  const bounds = [start, ...cuts, end];
  return bounds.slice(1).map((to, i) => {
    const from = bounds[i] as number;
    return { ...job, startIndex: from, count: to - from, initialState: i === 0 ? job.initialState : null };
  });
}

/**
 * Combines the outcomes of {@link splitJob}'s chunks, given in spin order, into the outcome
 * of the whole job. If any chunk was cancelled the result is marked cancelled, and its spins
 * are then not one unbroken prefix of the run: each chunk contributes its own prefix.
 */
export function mergeOutcomes(job: SimulationJob, outcomes: readonly SimulationOutcome[]): SimulationOutcome {
  const first = outcomes[0];
  if (first === undefined) throw new Error('No outcomes to merge.');
  let stats = emptyStats();
  let completed = 0;
  let cancelled = false;
  let endState = first.endState;
  for (const o of outcomes) {
    stats = mergeStats(stats, o.stats);
    completed += o.completed;
    cancelled ||= o.cancelled;
    if (o.completed > 0) endState = o.endState;
  }
  return { job, completed, cancelled, stats, endState };
}
