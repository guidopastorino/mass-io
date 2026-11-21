import { World } from '../../src/engine/world';
import type { GameMode } from '../../src/engine/constants';

/** Empty deterministic world (no food / viruses unless requested). */
export function emptyWorld(mode: GameMode = 'ffa', seed = 1) {
  return new World({ mode, seed, foodTarget: 0, virusMin: 0, spawnerCount: 0, mapSize: 10000 });
}

export function run(world: World, seconds: number, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) world.step(dt);
}
