import { PHYSICS } from './constants';

export const massToRadius = (mass: number) => Math.sqrt(mass * 100);
export const radiusToMass = (radius: number) => (radius * radius) / 100;

/** Movement speed in world units per second for a cell of the given radius. */
export const speedForRadius = (radius: number) => PHYSICS.SPEED_BASE * Math.pow(radius, PHYSICS.SPEED_EXP);

/** Seconds a cell of this mass has to wait after splitting before it can merge. */
export const recombineTime = (mass: number) => PHYSICS.RECOMBINE_BASE + mass * PHYSICS.RECOMBINE_PER_MASS;

export const canEatByMass = (predatorMass: number, preyMass: number) =>
  predatorMass >= preyMass * PHYSICS.EAT_MASS_RATIO;

/** Max center distance at which the predator swallows the prey. */
export const eatDistance = (predatorRadius: number, preyRadius: number) =>
  predatorRadius - preyRadius / PHYSICS.EAT_OVERLAP_DIV;

/**
 * Distance travelled during dt by an exponentially decaying boost with `remaining`
 * distance left. Integrates exactly, so it's frame-rate independent.
 */
export const boostStep = (remaining: number, dt: number, rate: number = PHYSICS.BOOST_DECAY) =>
  remaining * (1 - Math.exp(-rate * dt));

export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Exponential smoothing factor for a given rate (1/s) and dt. */
export const smoothing = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};
