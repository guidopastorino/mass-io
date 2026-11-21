import type { Camera } from '../engine/camera';
import { smoothing } from '../engine/math';
import type { SkinId } from '../engine/skins';
import type { Entity, Player } from '../engine/types';
import type { World } from '../engine/world';
import type { HudSettings, Theme } from '../game/settings';
import { getSkinCanvas } from './skins';

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

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private drawList: Entity[] = [];
  private darkCache = new Map<string, string>();

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

  render(world: World, cam: Camera, alpha: number, me: Player | null, opt: RenderOptions, dt: number) {
    const dpr = this.resize();
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const t = THEMES[opt.theme];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

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
    const rs = opt.animations ? smoothing(12, dt) : 1;
    for (const e of world.entities) {
      if (e.removed) continue;
      e.renderRadius += (e.radius - e.renderRadius) * rs;
      const r = e.renderRadius;
      const x = ix(e, alpha);
      const y = iy(e, alpha);
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
    for (const e of list) {
      const x = ix(e, alpha);
      const y = iy(e, alpha);
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
    ctx.beginPath();
    ctx.arc(x, y, r - border / 2, 0, Math.PI * 2);
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
