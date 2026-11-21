import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../src/engine/constants';
import { boostStep, canEatByMass, eatDistance, massToRadius, recombineTime, speedForRadius } from '../../src/engine/math';
import { emptyWorld, run } from './helpers';

describe('formulas', () => {
  it('radius = sqrt(mass * 100)', () => {
    expect(massToRadius(10)).toBeCloseTo(31.62, 2);
    expect(massToRadius(100)).toBe(100);
  });

  it('speed decreases with size', () => {
    expect(speedForRadius(massToRadius(10))).toBeGreaterThan(speedForRadius(massToRadius(1000)));
    // calibrated: a starting cell moves ~480 u/s
    expect(speedForRadius(massToRadius(10))).toBeGreaterThan(450);
    expect(speedForRadius(massToRadius(10))).toBeLessThan(520);
  });

  it('needs ~1.32x mass to eat', () => {
    expect(canEatByMass(132.3, 100)).toBe(true);
    expect(canEatByMass(130, 100)).toBe(false);
    expect(eatDistance(100, 30)).toBe(90);
  });

  it('boost integrates to the full distance regardless of dt', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      let rem = 780;
      let travelled = 0;
      for (let t = 0; t < 5; t += dt) {
        const s = boostStep(rem, dt);
        rem -= s;
        travelled += s;
      }
      expect(travelled).toBeGreaterThan(779);
    }
  });

  it('recombine time grows with mass', () => {
    expect(recombineTime(0)).toBe(30);
    expect(recombineTime(1000)).toBeCloseTo(53.3, 1);
  });
});

describe('movement', () => {
  it('cell moves toward the target and stops on it', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'a' });
    const c = w.spawnPlayer(p, 10, { x: 1000, y: 1000 });
    p.targetX = 1200;
    p.targetY = 1000;
    run(w, 0.1);
    expect(c.x).toBeGreaterThan(1000);
    expect(c.x).toBeLessThan(1200);
    run(w, 2);
    expect(c.x).toBeCloseTo(1200, 1);
  });

  it('bigger cells are slower', () => {
    const w = emptyWorld();
    const a = w.addPlayer({ name: 'a' });
    const b = w.addPlayer({ name: 'b' });
    const ca = w.spawnPlayer(a, 20, { x: 1000, y: 1000 });
    const cb = w.spawnPlayer(b, 2000, { x: 1000, y: 5000 });
    a.targetX = b.targetX = 9000;
    a.targetY = 1000;
    b.targetY = 5000;
    run(w, 1);
    expect(ca.x - 1000).toBeGreaterThan(cb.x - 1000);
  });

  it('cells stay inside the map', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'a' });
    const c = w.spawnPlayer(p, 100, { x: 200, y: 200 });
    p.targetX = -5000;
    p.targetY = -5000;
    run(w, 3);
    expect(c.x).toBeGreaterThanOrEqual(c.radius / 2);
    expect(c.y).toBeGreaterThanOrEqual(c.radius / 2);
  });

  it('mass decays slowly above the minimum', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'a' });
    const c = w.spawnPlayer(p, 1000, { x: 5000, y: 5000 });
    p.targetX = c.x;
    p.targetY = c.y;
    run(w, 10);
    expect(c.mass).toBeLessThan(1000);
    expect(c.mass).toBeGreaterThan(950);
  });
});

describe('eating', () => {
  it('eats food whose center is covered', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'a' });
    const c = w.spawnPlayer(p, 10, { x: 1000, y: 1000 });
    p.targetX = 1000;
    p.targetY = 1000;
    w.spawnFood(1010, 1000, 1);
    w.step(1 / 60);
    expect(c.mass).toBeCloseTo(11, 1);
    expect(w.foodCount).toBe(0);
    expect(p.stats.foodEaten).toBe(1);
  });

  it('eats a smaller enemy only with enough mass and overlap', () => {
    const w = emptyWorld();
    const a = w.addPlayer({ name: 'big' });
    const b = w.addPlayer({ name: 'small' });
    const ca = w.spawnPlayer(a, 200, { x: 1000, y: 1000 });
    w.spawnPlayer(b, 100, { x: 1200, y: 1000 });
    a.targetX = 1000; a.targetY = 1000; b.targetX = 1200; b.targetY = 1000;
    w.step(1 / 60);
    expect(b.alive).toBe(true); // not overlapped enough yet
    b.targetX = ca.x; b.targetY = ca.y;
    run(w, 1);
    expect(b.alive).toBe(false);
    expect(b.killedBy).toBe('big');
    expect(ca.mass).toBeGreaterThan(290);
    expect(w.drainEvents().some((e) => e.type === 'death' && e.playerId === b.id)).toBe(true);
  });

  it('similar sized cells cannot eat each other', () => {
    const w = emptyWorld();
    const a = w.addPlayer({ name: 'a' });
    const b = w.addPlayer({ name: 'b' });
    w.spawnPlayer(a, 100, { x: 1000, y: 1000 });
    w.spawnPlayer(b, 90, { x: 1001, y: 1000 });
    a.targetX = 1000; a.targetY = 1000; b.targetX = 1000; b.targetY = 1000;
    run(w, 0.5);
    expect(a.alive && b.alive).toBe(true);
  });

  it('pellets regenerate up to the target amount', () => {
    const w = emptyWorld();
    (w as unknown as { foodTarget: number }).foodTarget = 50;
    run(w, 2);
    expect(w.foodCount).toBe(50);
  });
});

describe('leaderboard', () => {
  it('ranks alive players by total mass', () => {
    const w = emptyWorld();
    const a = w.addPlayer({ name: 'a' });
    const b = w.addPlayer({ name: 'b' });
    w.spawnPlayer(a, 50, { x: 1000, y: 1000 });
    w.spawnPlayer(b, 500, { x: 5000, y: 5000 });
    w.step(1 / 60);
    expect(w.leaderboard.map((e) => e.name)).toEqual(['b', 'a']);
    expect(w.rankOf(a)).toBe(2);
    expect(PHYSICS.MAX_CELLS).toBe(16);
  });
});
