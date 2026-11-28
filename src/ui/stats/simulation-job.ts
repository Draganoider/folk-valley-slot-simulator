import type { GameConfig, SimulationJob } from '../../engine';

/** How the panel sizes and seeds a simulation. Pure, so it is tested in Node. */

/** The Scar Card resets every this many spins, as if a new player sat down (lanes, engine README). */
export const SIMULATION_LANE_LENGTH = 100_000;

/** The run sizes the panel offers. */
export const SIMULATION_SIZES = [10_000, 100_000, 1_000_000] as const;

/** Workers for a job: one per lane, at most one fewer than the cores and at most four. */
export function workerCount(spins: number, cores: number): number {
  const lanes = Math.ceil(spins / SIMULATION_LANE_LENGTH);
  return Math.max(1, Math.min(lanes, Math.max(1, cores - 1), 4));
}

export function simulationJob(config: GameConfig, count: number, masterSeed: string): SimulationJob {
  return {
    masterSeed,
    startIndex: 0,
    count,
    betLevel: config.bet.levels[0] as number,
    laneLength: SIMULATION_LANE_LENGTH,
    initialState: null,
  };
}

