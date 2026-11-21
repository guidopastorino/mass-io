/**
 * Soft-body membrane for cell outlines. Each cell owns a ring of radial offsets driven
 * by damped springs. Where the outline would cross another body (cell, virus, spawner)
 * or the map border, the target offset dents inward a little; the spring makes the
 * edge contract smoothly and wobble back when the contact ends.
 */

export interface MembraneBody {
  id: number;
  x: number;
  y: number;
  r: number;
}

export interface MembraneOptions {
  /** Fraction of the geometric penetration applied as dent ("leve" = subtle). */
  dentFactor: number;
  /** Max dent as a fraction of the radius. */
  maxDent: number;
  stiffness: number;
  damping: number;
}

export const DEFAULT_MEMBRANE: MembraneOptions = {
  dentFactor: 0.55,
  maxDent: 0.14,
  stiffness: 320,
  damping: 17,
};

export class Ring {
  readonly cos: Float32Array;
  readonly sin: Float32Array;
  readonly off: Float32Array;
  readonly vel: Float32Array;
  readonly target: Float32Array;
  seen = 0;
  constructor(readonly n: number) {
    this.cos = new Float32Array(n);
    this.sin = new Float32Array(n);
    this.off = new Float32Array(n);
    this.vel = new Float32Array(n);
    this.target = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.cos[i] = Math.cos(a);
      this.sin[i] = Math.sin(a);
    }
  }
}

/** Point count for a cell drawn at the given on-screen radius (bucketed to avoid churn). */
export function pointsFor(screenRadius: number) {
  if (screenRadius < 20) return 16;
  if (screenRadius < 45) return 24;
  if (screenRadius < 90) return 36;
  if (screenRadius < 180) return 52;
  return 72;
}

export class MembraneSystem {
  private rings = new Map<number, Ring>();
  private frame = 0;

  constructor(public opt: MembraneOptions = DEFAULT_MEMBRANE) {}

  ring(id: number) {
    return this.rings.get(id);
  }

  /**
   * Advances every membrane one frame.
   * @param cells bodies that own a membrane
   * @param obstacles bodies that can dent them (usually cells + viruses + spawners)
   */
  update(cells: readonly MembraneBody[], obstacles: readonly MembraneBody[], points: (b: MembraneBody) => number, mapSize: number, dt: number) {
    this.frame++;
    const { dentFactor, maxDent, stiffness, damping } = this.opt;
    const h = Math.min(dt, 1 / 30);
    const decay = Math.exp(-damping * h);
    for (const c of cells) {
      const n = points(c);
      let ring = this.rings.get(c.id);
      if (!ring || ring.n !== n) {
        ring = resample(ring, n);
        this.rings.set(c.id, ring);
      }
      ring.seen = this.frame;
      const t = ring.target;
      t.fill(0);
      const cap = -c.r * maxDent;

      for (const o of obstacles) {
        if (o.id === c.id || o.r < c.r * 0.12) continue;
        const dx = c.x - o.x;
        const dy = c.y - o.y;
        const d2 = dx * dx + dy * dy;
        const reach = c.r + o.r;
        if (d2 >= reach * reach) continue;
        // One body (mostly) covering the other: being eaten / hiding under a virus.
        if (d2 < Math.max(c.r, o.r) ** 2) continue;
        const cc = d2 - o.r * o.r;
        for (let i = 0; i < ring.n; i++) {
          // Ray from cell center along the point direction vs obstacle circle.
          const b = dx * ring.cos[i] + dy * ring.sin[i];
          const disc = b * b - cc;
          if (disc <= 0) continue;
          const s = -b - Math.sqrt(disc);
          if (s <= 0 || s >= c.r) continue;
          const dent = Math.max((s - c.r) * dentFactor, cap);
          if (dent < t[i]) t[i] = dent;
        }
      }

      // Map border.
      for (let i = 0; i < ring.n; i++) {
        const px = c.x + ring.cos[i] * c.r;
        const py = c.y + ring.sin[i] * c.r;
        let over = 0;
        if (px < 0) over = Math.max(over, -px / Math.abs(ring.cos[i] || 1));
        if (px > mapSize) over = Math.max(over, (px - mapSize) / Math.abs(ring.cos[i] || 1));
        if (py < 0) over = Math.max(over, -py / Math.abs(ring.sin[i] || 1));
        if (py > mapSize) over = Math.max(over, (py - mapSize) / Math.abs(ring.sin[i] || 1));
        if (over > 0) t[i] = Math.min(t[i], Math.max(-over * dentFactor, cap));
      }

      // Surface tension: blur targets so dents are rounded, not stepped.
      const n0 = ring.n;
      let prev = t[n0 - 1];
      const first = t[0];
      for (let i = 0; i < n0; i++) {
        const next = i === n0 - 1 ? first : t[i + 1];
        const cur = t[i];
        t[i] = (prev + cur * 2 + next) / 4;
        prev = cur;
      }

      // Damped spring toward the target offset (semi-implicit Euler).
      const off = ring.off;
      const vel = ring.vel;
      for (let i = 0; i < n0; i++) {
        vel[i] = (vel[i] + (t[i] - off[i]) * stiffness * h) * decay;
        off[i] += vel[i] * h;
        // Never let the outline fold through the center.
        if (off[i] < -c.r * 0.5) off[i] = -c.r * 0.5;
      }
    }
    // Forget cells that are no longer drawn.
    if (this.frame % 60 === 0) {
      for (const [id, r] of this.rings) if (this.frame - r.seen > 30) this.rings.delete(id);
    }
  }
}

function resample(old: Ring | undefined, n: number) {
  const ring = new Ring(n);
  if (!old) return ring;
  for (let i = 0; i < n; i++) {
    const f = (i / n) * old.n;
    const a = Math.floor(f) % old.n;
    const b = (a + 1) % old.n;
    const k = f - Math.floor(f);
    ring.off[i] = old.off[a] * (1 - k) + old.off[b] * k;
    ring.vel[i] = old.vel[a] * (1 - k) + old.vel[b] * k;
  }
  return ring;
}
