import type { Camera } from '../engine/camera';
import { smoothing } from '../engine/math';
import type { SkinId } from '../engine/skins';
import type { Entity, Player } from '../engine/types';
import type { World } from '../engine/world';
import type { HudSettings, Theme } from '../game/settings';
import { MembraneSystem, pointsFor, type MembraneBody } from './membrane';
import { getSkinCanvas } from './skins';

/** Seconds a swallowed entity takes to slide into its eater. */
const SWALLOW_TIME = 0.16;
/**
 * Rate (1/s) at which drawn positions chase the simulation (time constant ~60 ms).
 * Like the interpolation delay of the classic clients, this turns the instant start of a
 * split / eject / collision push into a short ease-in, which is what makes motion read as
 * fluid instead of jumpy, while adding almost no perceptible lag.
 */
const POSITION_SMOOTHING = 16;
/** A drawn position further than this from the simulation snaps (teleport / respawn). */
const SNAP_DISTANCE = 900;

interface Dying {
  prey: Entity;
  pred: Entity;
  sx: number;
  sy: number;
  r: number;
  t: number;
}

export interface RenderOptions {
  theme: Theme;
  hud: HudSettings;
  animations: boolean;
}

const THEMES = {
  light: { bg: '#f3f6f8', grid: 'rgba(30,50,70,0.10)', border: '#e0546b', text: '#ffffff', outline: '#1b1f24', mini: 'rgba(25,35,45,0.55)' },
  dark: { bg: '#10141a', grid: 'rgba(160,190,220,0.09)', border: '#ff6b81', text: '#ffffff', outline: '#000000', mini: 'rgba(0,0,0,0.6)' },
};

/** Interpolated position helper. */
const ix = (e: Entity, a: number) => e.px + (e.x - e.px) * a;
const iy = (e: Entity, a: number) => e.py + (e.y - e.py) * a;

/**
 * Advances every entity's drawn position (rx, ry) toward its interpolated simulation
 * position. Run once per frame before the camera and the renderer read them.
 */
export function smoothPositions(world: World, alpha: number, dt: number, enabled: boolean) {
  const k = enabled ? smoothing(POSITION_SMOOTHING, dt) : 1;
  for (const e of world.entities) {
    if (e.removed) continue;
    const x = ix(e, alpha);
    const y = iy(e, alpha);
    const dx = x - e.rx;
    const dy = y - e.ry;
    if (k >= 1 || !(dx * dx + dy * dy < SNAP_DISTANCE * SNAP_DISTANCE)) {
      e.rx = x;
      e.ry = y;
    } else {
      e.rx += dx * k;
      e.ry += dy * k;
    }
  }
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private drawList: Entity[] = [];
  private darkCache = new Map<string, string>();
  readonly membranes = new MembraneSystem();
  private dying: Dying[] = [];
  private bodies: MembraneBody[] = [];
  private obstacles: MembraneBody[] = [];
  private bodyPool: MembraneBody[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  get width() {
    return this.canvas.clientWidth;
  }
  get height() {
    return this.canvas.clientHeight;
  }

  /** Resizes the backing store to the CSS size * devicePixelRatio. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return dpr;
  }

  render(world: World, cam: Camera, me: Player | null, opt: RenderOptions, dt: number) {
    const dpr = this.resize();
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const t = THEMES[opt.theme];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    for (const { prey, pred } of world.drainEaten()) {
      if (this.dying.length > 800) this.dying.shift();
      this.dying.push({ prey, pred, sx: prey.rx, sy: prey.ry, r: prey.renderRadius, t: 0 });
      // A small ripple where a bite enters (ejected mass, cells, viruses); pellets leave the edge alone.
      if (opt.animations && pred.kind === 'cell' && prey.kind !== 'food') {
        const ratio = prey.mass / Math.max(1, pred.mass);
        const strength = Math.min(0.045, 0.016 + Math.sqrt(ratio) * 0.09);
        this.membranes.kick(pred.id, Math.atan2(prey.ry - pred.ry, prey.rx - pred.rx), strength, pred.renderRadius);
      }
    }

    const z = cam.zoom;
    const left = cam.x - W / 2 / z;
    const top = cam.y - H / 2 / z;
    const right = cam.x + W / 2 / z;
    const bottom = cam.y + H / 2 / z;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);

    if (opt.hud.grid) this.drawGrid(left, top, right, bottom, z, t.grid);
    if (opt.hud.border) {
      ctx.strokeStyle = t.border;
      ctx.lineWidth = Math.max(4, 3 / z);
      ctx.strokeRect(0, 0, world.mapSize, world.mapSize);
    }

    // Cull and sort: pellets first, then everything else by mass so bigger bodies cover smaller ones.
    const list = this.drawList;
    list.length = 0;
    const rs = opt.animations ? Math.min(1, Math.max(0, smoothing(12, dt))) : 1;
    for (const e of world.entities) {
      if (e.removed) continue;
      e.renderRadius += (e.radius - e.renderRadius) * rs;
      if (!(e.renderRadius > 0)) e.renderRadius = e.radius;
      const r = e.renderRadius;
      const x = e.rx;
      const y = e.ry;
      if (x + r < left || x - r > right || y + r < top || y - r > bottom) continue;
      if (e.kind === 'food') {
        if (!opt.hud.pellets) continue;
        if (r * z < 0.6) continue;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      list.push(e);
    }
    list.sort((a, b) => a.mass - b.mass || a.id - b.id);

    // Soft-body membranes for visible cells, dented by nearby cells / viruses / spawners.
    this.bodies.length = 0;
    this.obstacles.length = 0;
    let pi = 0;
    for (const e of list) {
      if (e.kind === 'eject') continue;
      const b = this.bodyPool[pi] ?? (this.bodyPool[pi] = { id: 0, x: 0, y: 0, r: 0 });
      pi++;
      b.id = e.id;
      b.x = e.rx;
      b.y = e.ry;
      b.r = e.renderRadius;
      this.obstacles.push(b);
      if (e.kind === 'cell') this.bodies.push(b);
    }
    if (opt.animations) this.membranes.update(this.bodies, this.obstacles, (b) => pointsFor(b.r * z), world.mapSize, dt);

    this.drawDying(dt);
    for (const e of list) {
      const x = e.rx;
      const y = e.ry;
      switch (e.kind) {
        case 'eject':
          this.drawBlob(x, y, e.renderRadius, e.color);
          break;
        case 'virus':
          this.drawSpiky(x, y, e.renderRadius, 'rgba(60,220,90,0.82)', '#26a540', world.time * 0.15 + e.id, 0.05);
          break;
        case 'spawner':
          this.drawSpiky(x, y, e.renderRadius, 'rgba(206,99,99,0.95)', '#b14f4f', world.time * 0.4 + e.id, 0.035);
          break;
        case 'cell':
          this.drawCell(e, x, y, opt, z, me);
          break;
      }
    }
    ctx.restore();

    if (opt.hud.minimap) this.drawMinimap(world, cam, me, W, H, t.mini);
  }

  private drawGrid(l: number, t: number, r: number, b: number, z: number, color: string) {
    const ctx = this.ctx;
    // Grid spacing adapts so lines never become a dense blur when zoomed out.
    let step = 50;
    while (step * z < 14) step *= 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (let x = Math.floor(l / step) * step; x <= r; x += step) {
      ctx.moveTo(x, t);
      ctx.lineTo(x, b);
    }
    for (let y = Math.floor(t / step) * step; y <= b; y += step) {
      ctx.moveTo(l, y);
      ctx.lineTo(r, y);
    }
    ctx.stroke();
  }

  private darker(color: string) {
    let d = this.darkCache.get(color);
    if (!d) {
      const n = parseInt(color.slice(1), 16);
      const f = (v: number) => Math.floor(v * 0.78);
      d = `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
      this.darkCache.set(color, d);
    }
    return d;
  }

  private drawBlob(x: number, y: number, r: number, color: string) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.strokeStyle = this.darker(color);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawSpiky(x: number, y: number, r: number, fill: string, stroke: string, phase: number, spikeFrac: number) {
    const ctx = this.ctx;
    const spikes = Math.max(24, Math.round(r / 4.5));
    const depth = r * spikeFrac;
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 + phase * 0.02;
      const rr = i % 2 === 0 ? r : r - depth;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(3, r * 0.05);
    ctx.stroke();
  }

  private drawCell(e: Entity, x: number, y: number, opt: RenderOptions, z: number, me: Player | null) {
    const ctx = this.ctx;
    const r = e.renderRadius;
    const owner = e.owner!;
    const border = Math.max(3, r * 0.07);
    ctx.fillStyle = e.color;
    this.cellPath(e.id, x, y, r - border / 2, opt.animations);
    ctx.fill();
    const skin = opt.hud.skins && owner.skin ? getSkinCanvas(owner.skin as SkinId) : null;
    if (skin) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(skin, x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }
    ctx.strokeStyle = skin ? 'rgba(0,0,0,0.25)' : this.darker(e.color);
    ctx.lineWidth = border;
    ctx.stroke();

    const screenR = r * z;
    if (screenR < 9) return;
    const showName = opt.hud.names && owner.name;
    const showMass = opt.hud.cellMass && (owner === me || screenR > 30);
    if (!showName && !showMass) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (showName) {
      const fs = Math.max(r * 0.33, 10 / z);
      ctx.font = `700 ${fs}px Ubuntu, "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = fs * 0.14;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      ctx.strokeText(owner.name, x, y);
      ctx.fillText(owner.name, x, y);
    }
    if (showMass) {
      const fs = Math.max(r * 0.2, 8 / z);
      ctx.font = `700 ${fs}px Ubuntu, "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = fs * 0.14;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      const my = showName ? y + r * 0.32 : y;
      const txt = String(Math.floor(e.mass));
      ctx.strokeText(txt, x, my);
      ctx.fillText(txt, x, my);
    }
  }

  /** Traces the cell outline: a smooth closed curve through the membrane points. */
  private cellPath(id: number, x: number, y: number, r: number, soft: boolean) {
    const ctx = this.ctx;
    ctx.beginPath();
    const ring = soft ? this.membranes.ring(id) : undefined;
    if (!ring) {
      ctx.arc(x, y, r, 0, Math.PI * 2);
      return;
    }
    const n = ring.n;
    const px = (i: number) => x + ring.cos[i % n] * (r + ring.off[i % n]);
    const py = (i: number) => y + ring.sin[i % n] * (r + ring.off[i % n]);
    ctx.moveTo((px(0) + px(1)) / 2, (py(0) + py(1)) / 2);
    for (let i = 1; i <= n; i++) {
      ctx.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
    }
    ctx.closePath();
  }

  /** Swallowed entities slide into their eater's center while shrinking. */
  private drawDying(dt: number) {
    const ctx = this.ctx;
    let w = 0;
    for (const d of this.dying) {
      d.t += dt / SWALLOW_TIME;
      if (d.t >= 1) continue;
      this.dying[w++] = d;
      // ease-in-out slide toward the eater, shrinking with an ease-in so it doesn't vanish early
      const k = d.t * d.t * (3 - 2 * d.t);
      const tx = d.pred.rx;
      const ty = d.pred.ry;
      const x = d.sx + (tx - d.sx) * k;
      const y = d.sy + (ty - d.sy) * k;
      const r = d.r * (1 - d.t * d.t);
      if (r <= 0.5) continue;
      ctx.fillStyle = d.prey.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.dying.length = w;
  }

  private drawMinimap(world: World, cam: Camera, me: Player | null, W: number, H: number, bg: string) {
    const ctx = this.ctx;
    const size = Math.min(180, Math.max(110, W * 0.13));
    const x0 = W - size - 12;
    const y0 = H - size - 12;
    const s = size / world.mapSize;
    ctx.fillStyle = bg;
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + (size * i) / 5, y0);
      ctx.lineTo(x0 + (size * i) / 5, y0 + size);
      ctx.moveTo(x0, y0 + (size * i) / 5);
      ctx.lineTo(x0 + size, y0 + (size * i) / 5);
      ctx.stroke();
    }
    // Leaders as faint dots
    for (const entry of world.leaderboard) {
      const p = world.players.find((q) => q.id === entry.id);
      if (!p || p === me) continue;
      for (const c of p.cells) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(x0 + c.x * s, y0 + c.y * s, Math.max(1.5, c.radius * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Viewport rectangle
    const vw = (W / cam.zoom) * s;
    const vh = (H / cam.zoom) * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.strokeRect(x0 + cam.x * s - vw / 2, y0 + cam.y * s - vh / 2, vw, vh);
    // My minions (bots mode): ringed dots so they're easy to find.
    if (me) {
      for (const p of world.players) {
        if (p.master !== me || !p.alive) continue;
        for (const c of p.cells) {
          const mx = x0 + c.x * s;
          const my = y0 + c.y * s;
          const mr = Math.max(2.5, c.radius * s);
          ctx.fillStyle = c.color;
          ctx.beginPath();
          ctx.arc(mx, my, mr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(mx, my, mr + 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    if (me?.alive) {
      for (const c of me.cells) {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(x0 + c.x * s, y0 + c.y * s, Math.max(2.5, c.radius * s), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
