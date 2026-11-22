import { describe, expect, it } from 'vitest';
import { MembraneSystem, pointsFor } from '../../src/render/membrane';

const points = () => 32;

function settle(sys: MembraneSystem, cells: { id: number; x: number; y: number; r: number }[], obstacles = cells, frames = 90) {
  for (let i = 0; i < frames; i++) sys.update(cells, obstacles, points, 10000, 1 / 60);
}

describe('membrane', () => {
  it('stays round with nothing around', () => {
    const sys = new MembraneSystem();
    const cell = { id: 1, x: 5000, y: 5000, r: 100 };
    settle(sys, [cell]);
    const ring = sys.ring(1)!;
    expect(Math.max(...ring.off.map(Math.abs))).toBeLessThan(0.01);
  });

  it('contracts slightly where it touches another body, only on that side', () => {
    const sys = new MembraneSystem();
    const a = { id: 1, x: 5000, y: 5000, r: 100 };
    const virus = { id: 2, x: 5180, y: 5000, r: 100 };
    settle(sys, [a], [a, virus]);
    const ring = sys.ring(1)!;
    const facing = ring.off[0]; // angle 0 points at the virus
    const away = ring.off[16]; // angle PI
    expect(facing).toBeLessThan(-3);
    expect(facing).toBeGreaterThanOrEqual(-100 * 0.14 - 0.5); // "leve": capped dent
    expect(Math.abs(away)).toBeLessThan(0.5);
  });

  it('springs back smoothly once contact ends', () => {
    const sys = new MembraneSystem();
    const a = { id: 1, x: 5000, y: 5000, r: 100 };
    const other = { id: 2, x: 5170, y: 5000, r: 90 };
    settle(sys, [a], [a, other]);
    const dented = sys.ring(1)!.off[0];
    const trace: number[] = [];
    for (let i = 0; i < 120; i++) {
      sys.update([a], [a], points, 10000, 1 / 60);
      trace.push(sys.ring(1)!.off[0]);
    }
    expect(dented).toBeLessThan(-3);
    expect(Math.abs(trace[trace.length - 1])).toBeLessThan(0.2);
    // no single-frame jumps
    for (let i = 1; i < trace.length; i++) expect(Math.abs(trace[i] - trace[i - 1])).toBeLessThan(3);
  });

  it('dents against the map border', () => {
    const sys = new MembraneSystem();
    const a = { id: 1, x: 40, y: 5000, r: 100 };
    settle(sys, [a]);
    expect(sys.ring(1)!.off[16]).toBeLessThan(-3);
  });

  it('ignores bodies that cover the cell (eaten / under a virus)', () => {
    const sys = new MembraneSystem();
    const small = { id: 1, x: 5000, y: 5000, r: 40 };
    const virus = { id: 2, x: 5020, y: 5000, r: 100 };
    settle(sys, [small], [small, virus]);
    expect(Math.max(...sys.ring(1)!.off.map(Math.abs))).toBeLessThan(0.01);
  });

  it('dents stay subtle and never wobble past round on release', () => {
    const sys = new MembraneSystem();
    const a = { id: 1, x: 5000, y: 5000, r: 100 };
    const sib = { id: 2, x: 5150, y: 5000, r: 100 }; // pressed hard: 50 units overlap
    settle(sys, [a], [a, sib]);
    expect(sys.ring(1)!.off[0]).toBeGreaterThan(-8);
    let over = 0;
    for (let i = 0; i < 120; i++) {
      sys.update([a], [a], points, 10000, 1 / 60);
      over = Math.max(over, sys.ring(1)!.off[0]);
    }
    expect(over).toBeLessThan(0.5);
  });

  it('fades the dent with overlap depth instead of switching it off', () => {
    const sys = new MembraneSystem();
    const a = { id: 1, x: 5000, y: 5000, r: 100 };
    const b = { id: 2, x: 5200, y: 5000, r: 100 };
    let prev = 0;
    let maxJump = 0;
    // b slides through a (like a split piece flying out, reversed)
    for (let i = 0; i < 200; i++) {
      b.x = 5200 - i;
      sys.update([a], [a, b], points, 10000, 1 / 60);
      const o = sys.ring(1)!.off[0];
      maxJump = Math.max(maxJump, Math.abs(o - prev));
      prev = o;
    }
    expect(maxJump).toBeLessThan(0.6);
  });

  it('a swallow gives only a small ripple where the prey entered', () => {
    const sys = new MembraneSystem();
    const a = { id: 1, x: 5000, y: 5000, r: 100 };
    settle(sys, [a]);
    sys.kick(1, 0, 0.02, 100);
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      sys.update([a], [a], points, 10000, 1 / 60);
      peak = Math.min(peak, sys.ring(1)!.off[0]);
    }
    expect(peak).toBeLessThan(-0.8);
    expect(peak).toBeGreaterThan(-4);
    expect(Math.abs(sys.ring(1)!.off[16])).toBeLessThan(0.3); // opposite side untouched
  });

  it('uses more points for bigger on-screen cells', () => {
    expect(pointsFor(10)).toBeLessThan(pointsFor(300));
  });
});
