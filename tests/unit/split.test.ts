import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../src/engine/constants';
import { emptyWorld, run } from './helpers';

function setup(mass: number) {
  const w = emptyWorld();
  const p = w.addPlayer({ name: 'p' });
  const c = w.spawnPlayer(p, mass, { x: 5000, y: 5000 });
  p.targetX = 6000;
  p.targetY = 5000;
  return { w, p, c };
}

describe('split', () => {
  it('halves the cell and launches the half toward the cursor', () => {
    const { w, p } = setup(100);
    w.requestSplit(p);
    w.step(1 / 60);
    expect(p.cells).toHaveLength(2);
    expect(p.cells[0].mass).toBeCloseTo(p.cells[1].mass, 0);
    const child = p.cells[1];
    expect(child.bdx).toBeCloseTo(1, 3);
    run(w, 1);
    // the split piece flies ahead of the parent
    expect(child.x - p.cells[0].x).toBeGreaterThan(300);
  });

  it('does not split below the minimum mass', () => {
    const { w, p } = setup(PHYSICS.MIN_SPLIT_MASS - 1);
    w.requestSplit(p);
    w.step(1 / 60);
    expect(p.cells).toHaveLength(1);
  });

  it('chained splits are capped at 16 cells and conserve mass', () => {
    const { w, p } = setup(4000);
    w.requestSplit(p, 4);
    run(w, 0.2);
    expect(p.cells).toHaveLength(16);
    w.requestSplit(p);
    run(w, 0.1);
    expect(p.cells).toHaveLength(16);
    const total = p.cells.reduce((s, c) => s + c.mass, 0);
    expect(total).toBeGreaterThan(3990);
  });

  it('siblings push apart while they cannot merge', () => {
    const { w, p } = setup(200);
    w.requestSplit(p);
    p.targetX = 5000;
    p.targetY = 5000;
    run(w, 3);
    const [a, b] = p.cells;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    // Soft contact: pressed together toward the same cursor they overlap only slightly.
    expect(d).toBeGreaterThan((a.radius + b.radius) * 0.9);
  });

  it('sibling separation is gradual, never a one-step snap', () => {
    const { w, p } = setup(400);
    w.requestSplit(p);
    p.targetX = 5000;
    p.targetY = 5000;
    let maxJump = 0;
    let prev = { x: 0, y: 0 };
    for (let i = 0; i < 180; i++) {
      w.step(1 / 60);
      const c = p.cells[0];
      if (i > 0) maxJump = Math.max(maxJump, Math.hypot(c.x - prev.x, c.y - prev.y));
      prev = { x: c.x, y: c.y };
    }
    // a hard correction would teleport the parent by tens of units in a single tick
    expect(maxJump).toBeLessThan(15);
  });

  it('cells recombine after the merge timer elapses', () => {
    const { w, p } = setup(200);
    w.requestSplit(p);
    p.targetX = 5000;
    p.targetY = 5000;
    run(w, 10);
    expect(p.cells).toHaveLength(2);
    run(w, PHYSICS.RECOMBINE_BASE);
    expect(p.cells).toHaveLength(1);
    expect(p.cells[0].mass).toBeGreaterThan(160); // decay over ~40 s
  });

  it('merge timer depends on cell mass', () => {
    const small = setup(100);
    const big = setup(4000);
    small.w.requestSplit(small.p);
    big.w.requestSplit(big.p);
    small.w.step(1 / 60);
    big.w.step(1 / 60);
    expect(big.p.cells[1].mergeAt).toBeGreaterThan(small.p.cells[1].mergeAt + 40);
  });
});

describe('smooth movement', () => {
  it('eases to a stop near the cursor instead of snapping', () => {
    const { w, p, c } = setup(100);
    p.targetX = 5000 + c.radius * 0.5;
    p.targetY = 5000;
    w.step(1 / 60);
    const nearStep = c.x - 5000;
    const { w: w2, p: p2, c: c2 } = setup(100);
    p2.targetX = 6000;
    w2.step(1 / 60);
    // inside one radius the cell moves at a fraction of full speed
    expect(nearStep).toBeLessThan((c2.x - 5000) * 0.6);
    expect(nearStep).toBeGreaterThan(0);
  });

  it('absorptions are recorded for the renderer only when enabled', () => {
    const { w, p } = setup(100);
    p.targetX = 5000;
    w.spawnFood(5000, 5000, 1);
    w.step(1 / 60);
    expect(w.drainEaten()).toHaveLength(0);
    w.recordEaten = true;
    w.spawnFood(5000, 5000, 1);
    w.step(1 / 60);
    const eaten = w.drainEaten();
    expect(eaten).toHaveLength(1);
    expect(eaten[0].pred).toBe(p.cells[0]);
  });
});

describe('eject', () => {
  it('costs mass and launches a blob', () => {
    const { w, p, c } = setup(100);
    p.ejecting = true;
    w.step(1 / 60);
    const blobs = w.entities.filter((e) => e.kind === 'eject');
    expect(blobs).toHaveLength(1);
    expect(blobs[0].mass).toBe(PHYSICS.EJECT_MASS);
    expect(c.mass).toBeCloseTo(100 - PHYSICS.EJECT_MASS_LOSS, 1);
    p.ejecting = false;
    run(w, 2);
    expect(blobs[0].x - 5000).toBeGreaterThan(780);
  });

  it('respects the cooldown while held', () => {
    const { w, p } = setup(1000);
    p.targetX = 5000;
    p.targetY = 4000;
    p.ejecting = true;
    run(w, 1);
    const n = w.entities.filter((e) => e.kind === 'eject').length;
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(11);
  });

  it('cannot eject below the minimum mass', () => {
    const { w, p } = setup(30);
    p.ejecting = true;
    w.step(1 / 60);
    expect(w.entities.some((e) => e.kind === 'eject')).toBe(false);
  });

  it('ejected mass can be eaten by a bigger cell', () => {
    const w = emptyWorld();
    const a = w.addPlayer({ name: 'a' });
    const b = w.addPlayer({ name: 'b' });
    w.spawnPlayer(a, 200, { x: 2000, y: 2000 });
    const cb = w.spawnPlayer(b, 100, { x: 2000, y: 2600 });
    a.targetX = 2000; a.targetY = 3000; a.ejecting = true;
    b.targetX = 2000; b.targetY = 2600;
    w.step(1 / 60);
    a.ejecting = false;
    a.targetX = 2000; a.targetY = 2000;
    run(w, 3);
    expect(cb.mass).toBeGreaterThan(105);
  });
});
