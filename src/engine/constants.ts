/**
 * Physics constants, calibrated against the classic open-source reference
 * servers of the genre (values originally expressed per 40 ms server tick are
 * converted here to per-second units so the engine is frame-rate independent).
 *
 *   radius ("size") = sqrt(mass * 100)
 */
export const PHYSICS = {
  /** World is a square of this side length, centered at 0,0 is NOT used: [0, MAP_SIZE]. */
  MAP_SIZE: 14142,
  /** Fixed simulation step (seconds). */
  STEP: 1 / 60,

  // --- Player cells ---
  START_MASS: 10,
  /** Mass the human player starts each life with. */
  PLAYER_START_MASS: 1000,
  /** Below this radius the cursor ease-in distance stops shrinking (world units). */
  MOVE_EASE_MIN: 30,
  // --- Bots mode (controllable minions) ---
  /** Recombine timers are multiplied by this in bots mode (cells merge faster). */
  BOTS_MODE_RECOMBINE_SCALE: 0.25,
  MINIONS_PER_PLAYER: 3,
  /** Seconds between minion spawns while a player is below the cap. */
  MINION_SPAWN_INTERVAL: 4,
  MINION_START_MASS: 100,
  /** Minions spawn this far (min..max) from the edge of their master's nearest cell. */
  MINION_SPAWN_GAP_MIN: 120,
  MINION_SPAWN_GAP_MAX: 600,
  /** Soft sibling collision: fraction of overlap resolved per second (exponential). */
  RIGID_RATE: 30,
  MIN_SPLIT_MASS: 35,
  MIN_EJECT_MASS: 35,
  MAX_CELLS: 16,
  /** A single cell above this mass auto-splits (or stops growing if at MAX_CELLS). */
  MAX_CELL_MASS: 22500,
  /** speed (units/s) = SPEED_BASE * radius^SPEED_EXP  (2.2 * size^-0.439 per 40 ms tick). */
  SPEED_BASE: 2.2 * 25 * 40,
  SPEED_EXP: -0.439,
  /** Predator must be this many times the prey mass (1.15 in radius). */
  EAT_MASS_RATIO: 1.15 * 1.15,
  /** Prey is eaten when distance < R_pred - r_prey / EAT_OVERLAP_DIV. */
  EAT_OVERLAP_DIV: 3,
  /** Recombine time in seconds = BASE + mass * PER_MASS. */
  RECOMBINE_BASE: 30,
  RECOMBINE_PER_MASS: 0.0233,
  /** Freshly split cells ignore sibling rigid collision during this window (s). */
  SPLIT_NO_COLLIDE: 0.5,
  /**
   * Decay: the reference server multiplies mass by (1 - 0.002) once per second
   * (0.2 %/s, only above DECAY_MIN_MASS). Expressed as a continuous rate so it is
   * applied smoothly every step with the same result per second.
   */
  DECAY_RATE: -Math.log(1 - 0.002),
  DECAY_MIN_MASS: 10,

  // --- Boost (split / eject / virus shot) ---
  /** Total distance travelled by a boost impulse. */
  SPLIT_BOOST: 780,
  EJECT_BOOST: 780,
  VIRUS_SHOT_BOOST: 780,
  /** Boost decays by 1/9 per 40 ms tick -> exponential rate per second. */
  BOOST_DECAY: -25 * Math.log(8 / 9),

  // --- Eject (W) ---
  EJECT_MASS: 13,
  EJECT_MASS_LOSS: 18,
  /** Seconds between ejects while W is held (~12 per second at 60 Hz). */
  EJECT_COOLDOWN: 0.08,
  /** Max random deviation (rad) from the cursor direction: blobs fly in a near-straight line. */
  EJECT_SPREAD: 0.03,

  // --- Food ---
  FOOD_MIN_MASS: 1,
  FOOD_MAX_MASS: 4,
  FOOD_TARGET: 2000,
  FOOD_SPAWN_PER_SECOND: 60,
  /** Average seconds for a pellet to grow by one mass unit. */
  FOOD_GROW_INTERVAL: 25,

  // --- Viruses ---
  VIRUS_MASS: 100,
  /** Number of ejected blobs a virus swallows before shooting a new virus. */
  VIRUS_FEED_SHOTS: 7,
  VIRUS_MIN_COUNT: 45,
  VIRUS_MAX_COUNT: 90,
  /** Experimental: push applied to a virus per ejected blob it swallows. */
  VIRUS_PUSH: 220,

  // --- Experimental spawners ("mother cells") ---
  SPAWNER_MASS: 222,
  SPAWNER_COUNT: 12,
  /** Passive pellets produced per second at base mass. */
  SPAWNER_PASSIVE_RATE: 1.5,
  /** Maximum pellets released per second while redistributing excess mass. */
  SPAWNER_RELEASE_RATE: 40,
  SPAWNER_PELLET_BOOST: 260,
} as const;

export type GameMode = 'ffa' | 'experimental' | 'bots';
