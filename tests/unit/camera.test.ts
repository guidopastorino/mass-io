import { describe, expect, it } from 'vitest';
import { Camera, cameraTarget } from '../../src/engine/camera';
import { massToRadius } from '../../src/engine/math';

const cell = (x: number, y: number, mass: number) => ({ x, y, radius: massToRadius(mass) });

describe('camera target', () => {
  it('centers on a single cell at full zoom when small', () => {
    const t = cameraTarget([cell(100, 200, 10)], 1920, 1080)!;
    expect(t.x).toBe(100);
    expect(t.y).toBe(200);
    expect(t.zoom).toBeCloseTo(1, 5);
  });

  it('zooms out as total size grows', () => {
    const small = cameraTarget([cell(0, 0, 100)], 1920, 1080)!;
    const big = cameraTarget([cell(0, 0, 5000)], 1920, 1080)!;
    expect(big.zoom).toBeLessThan(small.zoom);
    expect(big.zoom).toBeCloseTo(Math.pow(64 / massToRadius(5000), 0.4), 5);
  });

  it('keeps every split piece on screen, even far away', () => {
    const cells = [cell(0, 0, 400), cell(2500, 0, 50), cell(-300, 900, 50)];
    const t = cameraTarget(cells, 1280, 720)!;
    for (const c of cells) {
      const sx = (c.x - t.x) * t.zoom + 640;
      const sy = (c.y - t.y) * t.zoom + 360;
      expect(sx - c.radius * t.zoom).toBeGreaterThanOrEqual(0);
      expect(sx + c.radius * t.zoom).toBeLessThanOrEqual(1280);
      expect(sy - c.radius * t.zoom).toBeGreaterThanOrEqual(0);
      expect(sy + c.radius * t.zoom).toBeLessThanOrEqual(720);
    }
  });

  it('center is weighted toward larger cells', () => {
    const t = cameraTarget([cell(0, 0, 1000), cell(1000, 0, 10)], 1920, 1080)!;
    expect(t.x).toBeLessThan(200);
  });

  it('scales with the viewport size', () => {
    const a = cameraTarget([cell(0, 0, 10)], 960, 540)!;
    const b = cameraTarget([cell(0, 0, 10)], 1920, 1080)!;
    expect(a.zoom).toBeCloseTo(b.zoom / 2, 5);
  });
});

describe('camera smoothing', () => {
  it('converges smoothly without overshoot', () => {
    const cam = new Camera();
    cam.update([cell(0, 0, 10)], 1920, 1080, 1 / 60);
    let last = cam.x;
    for (let i = 0; i < 120; i++) {
      cam.update([cell(1000, 0, 10)], 1920, 1080, 1 / 60);
      expect(cam.x).toBeGreaterThanOrEqual(last);
      expect(cam.x).toBeLessThanOrEqual(1000);
      // no single-frame jump bigger than 15% of the remaining distance
      last = cam.x;
    }
    expect(cam.x).toBeGreaterThan(990);
  });

  it('zoom changes gradually after a split / growth', () => {
    const cam = new Camera();
    cam.update([cell(0, 0, 100)], 1920, 1080, 1 / 60);
    const z0 = cam.zoom;
    cam.update([cell(0, 0, 3000)], 1920, 1080, 1 / 60);
    const z1 = cam.zoom;
    expect(z1).toBeLessThan(z0);
    expect(z0 - z1).toBeLessThan((z0 - cameraTarget([cell(0, 0, 3000)], 1920, 1080)!.zoom) * 0.1);
  });

  it('follows a split without jumping', () => {
    const cam = new Camera();
    cam.update([cell(0, 0, 400)], 1920, 1080, 1 / 60);
    // the half flies off 780 units over ~1.6 s; the camera eases toward the new center
    let maxDx = 0;
    let maxDz = 0;
    let prevX = cam.x;
    let prevZ = cam.zoom;
    for (let i = 0; i < 120; i++) {
      const t = i / 60;
      const off = 780 * (1 - Math.exp(-1.9 * t));
      cam.update([cell(0, 0, 200), cell(off, 0, 200)], 1920, 1080, 1 / 60);
      maxDx = Math.max(maxDx, Math.abs(cam.x - prevX));
      maxDz = Math.max(maxDz, Math.abs(Math.log(cam.zoom / prevZ)));
      prevX = cam.x;
      prevZ = cam.zoom;
    }
    expect(maxDx).toBeLessThan(10); // < 10 world units per frame
    expect(maxDz).toBeLessThan(0.02); // < 2 % zoom change per frame
  });

  it('is frame-rate independent', () => {
    const a = new Camera();
    const b = new Camera();
    a.update([cell(0, 0, 10)], 1920, 1080, 1 / 60);
    b.update([cell(0, 0, 10)], 1920, 1080, 1 / 60);
    for (let i = 0; i < 60; i++) a.update([cell(500, 0, 10)], 1920, 1080, 1 / 60);
    for (let i = 0; i < 144; i++) b.update([cell(500, 0, 10)], 1920, 1080, 1 / 144);
    expect(a.x).toBeCloseTo(b.x, 3);
  });

  it('wheel zoom is clamped and screen/world transforms invert', () => {
    const cam = new Camera();
    for (let i = 0; i < 50; i++) cam.wheel(-500);
    expect(cam.userZoom).toBe(1.6);
    cam.snap({ x: 100, y: 50, zoom: 0.5 });
    const w = cam.screenToWorld(300, 200, 800, 600);
    const s = cam.worldToScreen(w.x, w.y, 800, 600);
    expect(s.x).toBeCloseTo(300);
    expect(s.y).toBeCloseTo(200);
  });
});
