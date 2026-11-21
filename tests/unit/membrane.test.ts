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

  it('uses more points for bigger on-screen cells', () => {
    expect(pointsFor(10)).toBeLessThan(pointsFor(300));
  });
});
