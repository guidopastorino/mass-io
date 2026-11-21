import { smoothing } from './math';

export interface CameraCell {
  x: number;
  y: number;
  radius: number;
}

export interface CameraTarget {
  x: number;
  y: number;
  zoom: number;
}

/** Reference viewport used for zoom scaling (zoom 1 shows this many world units). */
export const BASE_VIEW_W = 1920;
export const BASE_VIEW_H = 1080;
/** World padding kept visible around the outermost cell. */
const FIT_PADDING = 160;

/**
 * Computes where the camera should look for a set of cells.
 *
 * - Zoom follows the classic genre formula pow(min(64 / Σradius, 1), 0.4) scaled to the
 *   viewport, so the view widens as the player grows.
 * - The center is the radius-weighted average of all cells.
 * - The view is additionally widened so the bounding box of every cell (plus padding)
 *   always fits on screen: split pieces far from the main body are never clipped.
 */
export function cameraTarget(cells: readonly CameraCell[], viewW: number, viewH: number, userZoom = 1): CameraTarget | null {
  if (cells.length === 0) return null;
  let sumR = 0;
  let wx = 0;
  let wy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    sumR += c.radius;
    wx += c.x * c.radius;
    wy += c.y * c.radius;
    minX = Math.min(minX, c.x - c.radius);
    minY = Math.min(minY, c.y - c.radius);
    maxX = Math.max(maxX, c.x + c.radius);
    maxY = Math.max(maxY, c.y + c.radius);
  }
  const x = wx / sumR;
  const y = wy / sumR;
  const screenScale = Math.max(viewH / BASE_VIEW_H, viewW / BASE_VIEW_W);
  const sizeZoom = Math.pow(Math.min(64 / sumR, 1), 0.4) * screenScale * userZoom;
  const halfW = Math.max(x - minX, maxX - x) + FIT_PADDING;
  const halfH = Math.max(y - minY, maxY - y) + FIT_PADDING;
  const fitZoom = Math.min(viewW / (2 * halfW), viewH / (2 * halfH));
  return { x, y, zoom: Math.max(0.02, Math.min(sizeZoom, fitZoom)) };
}

/** Smoothly follows a target; zoom is interpolated in log-space so it never "jumps". */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  userZoom = 1;
  private ready = false;
  /** Follow rate (1/s) for position and zoom. */
  constructor(
    public moveRate = 7,
    public zoomRate = 3.2,
  ) {}

  reset() {
    this.ready = false;
  }

  snap(t: CameraTarget) {
    this.x = t.x;
    this.y = t.y;
    this.zoom = t.zoom;
    this.ready = true;
  }

  update(cells: readonly CameraCell[], viewW: number, viewH: number, dt: number) {
    const t = cameraTarget(cells, viewW, viewH, this.userZoom);
    if (!t) return;
    if (!this.ready) return this.snap(t);
    const k = smoothing(this.moveRate, dt);
    this.x += (t.x - this.x) * k;
    this.y += (t.y - this.y) * k;
    const kz = smoothing(this.zoomRate, dt);
    this.zoom = Math.exp(Math.log(this.zoom) + (Math.log(t.zoom) - Math.log(this.zoom)) * kz);
  }

  /** Multiplies the user zoom (mouse wheel), clamped to a sensible range. */
  wheel(deltaY: number) {
    this.userZoom = Math.min(1.6, Math.max(0.45, this.userZoom * Math.exp(-deltaY * 0.0012)));
  }

  screenToWorld(sx: number, sy: number, viewW: number, viewH: number) {
    return { x: this.x + (sx - viewW / 2) / this.zoom, y: this.y + (sy - viewH / 2) / this.zoom };
  }

  worldToScreen(wx: number, wy: number, viewW: number, viewH: number) {
    return { x: (wx - this.x) * this.zoom + viewW / 2, y: (wy - this.y) * this.zoom + viewH / 2 };
  }
}
