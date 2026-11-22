/**
 * Soft-body membrane for cell outlines. Each cell owns a ring of radial offsets driven
 * by damped springs. Where the outline would cross another body (cell, virus, spawner)
 * or the map border, the target offset dents inward a little; the spring makes the
 * edge contract smoothly and settle back when the contact ends.
 *
 * The effect is meant to be felt, not seen as a squash: dents are small, saturate
 * softly, fade in/out with overlap depth and obstacle size (no on/off toggles), and the
 * springs are close to critically damped so they never jiggle. Swallowing something
 * gives the edge a tiny ripple where it entered (see `kick`).
 */

export interface MembraneBody {
  id: number;
  x: number;
  y: number;
  r: number;
}

export interface MembraneOptions {
  /** Fraction of the geometric penetration applied as dent. */
  dentFactor: number;
  /** Max dent as a fraction of the radius (reached asymptotically). */
  maxDent: number;
  stiffness: number;
  damping: number;
}

export const DEFAULT_MEMBRANE: MembraneOptions = {
  dentFactor: 0.4,
  maxDent: 0.065,
  stiffness: 260,
  // damping ratio ~0.85: one soft settle, no wobble
  damping: 27,
};

/** Hard bounds for the outline, as fractions of the radius. */
const MAX_IN = 0.12;
const MAX_OUT = 0.05;

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

const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class MembraneSystem {
  private rings = new Map<number, Ring>();
  private frame = 0;

  constructor(public opt: MembraneOptions = DEFAULT_MEMBRANE) {}

  ring(id: number) {
    return this.rings.get(id);
  }

  /**
   * Gives the membrane of `id` a small ripple at `angle`, e.g. where food was swallowed.
   * `strength` is the approximate peak displacement as a fraction of the radius.
   */
  kick(id: number, angle: number, strength: number, radius: number) {
    const ring = this.rings.get(id);
    if (!ring || !(strength > 0)) return;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    // velocity that yields ~`strength * radius` peak displacement for this spring
    const v = -strength * radius * Math.sqrt(this.opt.stiffness) * 2.9;
    for (let i = 0; i < ring.n; i++) {
      const dot = ring.cos[i] * ca + ring.sin[i] * sa;
      if (dot <= 0.5) continue;
      // smooth bump ~±60° wide around the contact point
      const w = smoothstep((dot - 0.5) / 0.5);
      ring.vel[i] += v * w;
    }
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
      const cap = c.r * maxDent;
      // soft saturation: linear for small dents, never beyond `cap`
      const shape = (pen: number) => -cap * Math.tanh((pen * dentFactor) / cap);

      for (const o of obstacles) {
        if (o.id === c.id) continue;
        // tiny bodies (pellets-sized relative to the cell) barely matter; fade them in
        const sizeW = smoothstep((o.r / c.r - 0.08) / 0.17);
        if (sizeW <= 0) continue;
        const dx = c.x - o.x;
        const dy = c.y - o.y;
        const d2 = dx * dx + dy * dy;
        const reach = c.r + o.r;
        if (d2 >= reach * reach) continue;
        // One body (mostly) covering the other (being eaten, hiding under a virus, a split
        // piece emerging): fade the dent out with depth instead of switching it off.
        const big = Math.max(c.r, o.r);
        const depthW = smoothstep((Math.sqrt(d2) - big * 0.65) / (big * 0.35));
        const w = sizeW * depthW;
        if (w <= 0) continue;
        const cc = d2 - o.r * o.r;
        for (let i = 0; i < ring.n; i++) {
          // Ray from cell center along the point direction vs obstacle circle.
          const b = dx * ring.cos[i] + dy * ring.sin[i];
          const disc = b * b - cc;
          if (disc <= 0) continue;
          const s = -b - Math.sqrt(disc);
          if (s <= 0 || s >= c.r) continue;
          const dent = shape(c.r - s) * w;
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
        if (over > 0) t[i] = Math.min(t[i], shape(over));
      }

      // Surface tension: blur targets twice so dents are broad and rounded, not pinched.
      const n0 = ring.n;
      for (let pass = 0; pass < 2; pass++) {
        let prev = t[n0 - 1];
        const first = t[0];
        for (let i = 0; i < n0; i++) {
          const next = i === n0 - 1 ? first : t[i + 1];
          const cur = t[i];
          t[i] = (prev + cur * 2 + next) / 4;
          prev = cur;
        }
      }

      // Damped spring toward the target offset (semi-implicit Euler), plus a light
      // neighbour coupling so ripples spread along the edge instead of spiking one point.
      const off = ring.off;
      const vel = ring.vel;
      const lo = -c.r * MAX_IN;
      const hi = c.r * MAX_OUT;
      for (let i = 0; i < n0; i++) {
        const l = off[i === 0 ? n0 - 1 : i - 1];
        const r = off[i === n0 - 1 ? 0 : i + 1];
        const tension = ((l + r) / 2 - off[i]) * 0.35;
        vel[i] = (vel[i] + (t[i] - off[i] + tension) * stiffness * h) * decay;
      }
      for (let i = 0; i < n0; i++) {
        off[i] += vel[i] * h;
        if (off[i] < lo) {
          off[i] = lo;
          if (vel[i] < 0) vel[i] = 0;
        } else if (off[i] > hi) {
          off[i] = hi;
          if (vel[i] > 0) vel[i] = 0;
        }
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
