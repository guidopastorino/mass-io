import { createRng } from '../engine/rng';
import type { SkinId } from '../engine/skins';

const SIZE = 256;
const cache = new Map<string, HTMLCanvasElement>();

/** Procedurally painted planet textures (original artwork, generated at runtime). */
export function getSkinCanvas(id: SkinId): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const hit = cache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  ctx.clip();
  if (id === 'earth') paintEarth(ctx);
  else if (id === 'moon') paintMoon(ctx);
  else paintMars(ctx);
  shade(ctx);
  ctx.restore();
  cache.set(id, c);
  return c;
}

export function getSkinDataUrl(id: SkinId): string {
  return getSkinCanvas(id)?.toDataURL() ?? '';
}

function blob(ctx: CanvasRenderingContext2D, rng: () => number, x: number, y: number, r: number, points = 9) {
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (0.6 + rng() * 0.6);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.quadraticCurveTo(x + Math.cos(a - 0.3) * rr * 1.1, y + Math.sin(a - 0.3) * rr * 1.1, px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function paintEarth(ctx: CanvasRenderingContext2D) {
  const rng = createRng(7);
  const g = ctx.createRadialGradient(100, 90, 20, 128, 128, 140);
  g.addColorStop(0, '#3fa0e8');
  g.addColorStop(1, '#14518f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const land = [
    [70, 80, 48],
    [95, 160, 40],
    [180, 110, 44],
    [170, 190, 30],
    [125, 120, 18],
  ];
  for (const [x, y, r] of land) {
    ctx.fillStyle = '#3c9a4a';
    blob(ctx, rng, x, y, r, 11);
    ctx.fillStyle = '#7bbf4e';
    blob(ctx, rng, x - r * 0.15, y - r * 0.1, r * 0.55, 8);
    ctx.fillStyle = '#c9b27a';
    blob(ctx, rng, x + r * 0.2, y + r * 0.15, r * 0.25, 7);
  }
  ctx.fillStyle = '#f4f8fb';
  ctx.fillRect(0, 0, SIZE, 14);
  ctx.fillRect(0, SIZE - 12, SIZE, 12);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) blob(ctx, rng, rng() * SIZE, rng() * SIZE, 10 + rng() * 18, 7);
  ctx.globalAlpha = 1;
}

function paintMoon(ctx: CanvasRenderingContext2D) {
  const rng = createRng(3);
  const g = ctx.createRadialGradient(100, 90, 10, 128, 128, 150);
  g.addColorStop(0, '#e9e9ec');
  g.addColorStop(1, '#8d8f96');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = 'rgba(90,92,100,0.35)';
  blob(ctx, rng, 90, 110, 50, 10);
  blob(ctx, rng, 170, 160, 38, 10);
  for (let i = 0; i < 22; i++) {
    const x = rng() * SIZE;
    const y = rng() * SIZE;
    const r = 4 + rng() * 14;
    ctx.fillStyle = 'rgba(70,72,80,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.7, Math.PI * 0.9, Math.PI * 1.6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.stroke();
  }
}

function paintMars(ctx: CanvasRenderingContext2D) {
  const rng = createRng(11);
  ctx.fillStyle = '#d4602b';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const bands = ['#e27a3a', '#b84a1f', '#e88a4a', '#c4562a', '#9e3d18', '#df7034'];
  for (let y = 0; y < SIZE; y += 18) {
    ctx.fillStyle = bands[Math.floor(rng() * bands.length)];
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= SIZE; x += 32) ctx.lineTo(x, y + (rng() - 0.5) * 8);
    ctx.lineTo(SIZE, y + 14 + rng() * 6);
    ctx.lineTo(0, y + 14 + rng() * 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(80,25,10,0.55)';
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.ellipse(rng() * SIZE, rng() * SIZE, 3 + rng() * 7, 2 + rng() * 4, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,240,230,0.8)';
  blob(ctx, rng, 128, 6, 34, 8);
}

function shade(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(90, 80, 40, 128, 128, 135);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}
