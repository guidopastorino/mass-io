import type { GameMode } from './constants';

export type EntityKind = 'cell' | 'food' | 'virus' | 'eject' | 'spawner';

export interface Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  /** Position at the previous simulation step, for render interpolation. */
  px: number;
  py: number;
  mass: number;
  radius: number;
  color: string;
  /** Remaining boost distance and its unit direction. */
  boost: number;
  bdx: number;
  bdy: number;
  /** World time when the entity was created. */
  born: number;
  removed: boolean;
  /** Player cells only. */
  owner: Player | null;
  /** Player cells: world time after which the cell may merge with siblings. */
  mergeAt: number;
  /** Viruses: number of ejected blobs swallowed since last shot. */
  feed: number;
  /** Food: time of next growth tick. */
  nextGrow: number;
  /** Ejected mass: player that shot it (for stats / AI). */
  shooterId: number;
  /** Generic accumulator (spawner pellet production). */
  acc: number;
  /** Visual radius, smoothed by the renderer. */
  renderRadius: number;
}

export interface PlayerStats {
  spawnedAt: number;
  diedAt: number;
  peakMass: number;
  foodEaten: number;
  cellsEaten: number;
  virusesEaten: number;
  bestRank: number;
  massEaten: number;
}

export interface Player {
  id: number;
  name: string;
  skin: string | null;
  color: string;
  isBot: boolean;
  alive: boolean;
  cells: Entity[];
  /** World-space point the cells steer toward. */
  targetX: number;
  targetY: number;
  /** Pending split actions (one per key press). */
  splitQueue: number;
  ejecting: boolean;
  lastEject: number;
  /** Time when a dead bot should respawn. */
  respawnAt: number;
  stats: PlayerStats;
  killedBy: string | null;
  /** Bots mode: the player controlling this minion (null for regular players). */
  master: Player | null;
  /** Bots mode: pending split actions to apply to this player's minions. */
  minionSplitQueue: number;
  /** Bots mode: master is holding the "feed" key; its minions eject mass toward it. */
  minionEjecting: boolean;
  /** When set, ejected mass is aimed at this point instead of the cursor target. */
  ejectAt: { x: number; y: number } | null;
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  mass: number;
  isHuman: boolean;
}

export interface WorldOptions {
  mode: GameMode;
  seed?: number;
  botCount?: number;
  mapSize?: number;
  foodTarget?: number;
  virusMin?: number;
  virusMax?: number;
  spawnerCount?: number;
}

export type WorldEvent =
  | { type: 'death'; playerId: number; killer: string | null }
  | { type: 'eat'; predatorId: number; preyId: number };
