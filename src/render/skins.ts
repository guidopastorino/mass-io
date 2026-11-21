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
  PAINTERS[id](ctx);
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

function paintSun(ctx: CanvasRenderingContext2D) {
  const rng = createRng(21);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 140);
  g.addColorStop(0, '#fff6b0');
  g.addColorStop(0.45, '#ffc93c');
  g.addColorStop(0.85, '#ff8a1e');
  g.addColorStop(1, '#e35d0c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // granulation
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,240,170,0.35)' : 'rgba(230,110,20,0.25)';
    ctx.beginPath();
    ctx.arc(rng() * SIZE, rng() * SIZE, 4 + rng() * 10, 0, Math.PI * 2);
    ctx.fill();
  }
  // a few dark spots
  ctx.fillStyle = 'rgba(120,45,5,0.55)';
  for (let i = 0; i < 4; i++) blob(ctx, rng, 60 + rng() * 140, 60 + rng() * 140, 6 + rng() * 6, 7);
}

function paintJupiter(ctx: CanvasRenderingContext2D) {
  const rng = createRng(5);
  const bands = ['#e8d3b4', '#c99c6e', '#f2e4cc', '#b07a4f', '#ddc09a', '#a86c44', '#efdcc0'];
  let y = 0;
  while (y < SIZE) {
    const h = 14 + rng() * 22;
    ctx.fillStyle = bands[Math.floor(rng() * bands.length)];
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= SIZE; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
    ctx.lineTo(SIZE, y + h + 4);
    ctx.lineTo(0, y + h + 4);
    ctx.closePath();
    ctx.fill();
    y += h;
  }
  // great storm
  ctx.fillStyle = '#c0533a';
  ctx.beginPath();
  ctx.ellipse(170, 165, 30, 17, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,190,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function paintNeptune(ctx: CanvasRenderingContext2D) {
  const rng = createRng(9);
  const g = ctx.createLinearGradient(0, 0, 0, SIZE);
  g.addColorStop(0, '#5aa9ff');
  g.addColorStop(0.5, '#2f6fe0');
  g.addColorStop(1, '#1b3f9e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = 'rgba(190,225,255,0.35)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const yy = 20 + rng() * 216;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.bezierCurveTo(80, yy - 10, 170, yy + 10, SIZE, yy - 4);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(15,30,90,0.7)';
  ctx.beginPath();
  ctx.ellipse(90, 120, 24, 13, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) blob(ctx, rng, 60 + rng() * 140, 40 + rng() * 170, 5 + rng() * 6, 6);
}

function paintLava(ctx: CanvasRenderingContext2D) {
  const rng = createRng(13);
  ctx.fillStyle = '#2b1210';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // glowing cracks between dark crust plates
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = rng() * SIZE;
    let y = rng() * SIZE;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rng() - 0.5) * 60;
      y += (rng() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#ff5a1f';
    ctx.lineWidth = 6 + rng() * 4;
    ctx.stroke();
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,120,30,0.25)';
  for (let i = 0; i < 6; i++) blob(ctx, rng, rng() * SIZE, rng() * SIZE, 20 + rng() * 20, 8);
}

function paintGalaxy(ctx: CanvasRenderingContext2D) {
  const rng = createRng(17);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 150);
  g.addColorStop(0, '#4b2a8f');
  g.addColorStop(0.6, '#1d1450');
  g.addColorStop(1, '#090720');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // spiral arms made of soft dots
  for (let arm = 0; arm < 3; arm++) {
    for (let i = 0; i < 140; i++) {
      const t = i / 140;
      const a = arm * ((Math.PI * 2) / 3) + t * Math.PI * 2.4;
      const r = 8 + t * 120;
      const x = 128 + Math.cos(a) * r + (rng() - 0.5) * 14;
      const y = 128 + Math.sin(a) * r + (rng() - 0.5) * 14;
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,150,230,0.35)' : 'rgba(140,200,255,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 2 + rng() * 4 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const core = ctx.createRadialGradient(128, 128, 0, 128, 128, 34);
  core.addColorStop(0, 'rgba(255,250,230,0.95)');
  core.addColorStop(1, 'rgba(255,200,240,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 60; i++) ctx.fillRect(rng() * SIZE, rng() * SIZE, 1.5, 1.5);
}

const PAINTERS: Record<SkinId, (ctx: CanvasRenderingContext2D) => void> = {
  earth: paintEarth,
  moon: paintMoon,
  mars: paintMars,
  sun: paintSun,
  jupiter: paintJupiter,
  neptune: paintNeptune,
  lava: paintLava,
  galaxy: paintGalaxy,
};

function shade(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(90, 80, 40, 128, 128, 135);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}
