import type { Entity } from './types';

/**
 * Uniform spatial hash keyed by entity center. All eating rules require the prey's
 * center to lie inside the predator, so querying a box of the predator's radius is
 * enough to find every candidate.
 */
export class SpatialGrid {
  private buckets = new Map<number, Entity[]>();
  constructor(private cellSize = 256) {}

  private key(cx: number, cy: number) {
    return (cx + 1024) * 4096 + (cy + 1024);
  }

  clear() {
    for (const b of this.buckets.values()) b.length = 0;
  }

  insert(e: Entity) {
    const k = this.key(Math.floor(e.x / this.cellSize), Math.floor(e.y / this.cellSize));
    let b = this.buckets.get(k);
    if (!b) {
      b = [];
      this.buckets.set(k, b);
    }
    b.push(e);
  }

  /** Calls fn for each entity whose center is inside the axis-aligned box. */
  query(x: number, y: number, range: number, fn: (e: Entity) => void) {
    const s = this.cellSize;
    const x0 = Math.floor((x - range) / s);
    const x1 = Math.floor((x + range) / s);
    const y0 = Math.floor((y - range) / s);
    const y1 = Math.floor((y + range) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (!b) continue;
        for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}
