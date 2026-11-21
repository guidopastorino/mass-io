import { BotController } from '../engine/bots';
import { Camera, type CameraCell } from '../engine/camera';
import { PHYSICS, type GameMode } from '../engine/constants';
import type { SkinId } from '../engine/skins';
import type { LeaderboardEntry, Player, PlayerStats } from '../engine/types';
import { World } from '../engine/world';
import { Renderer } from '../render/renderer';
import type { Action, Settings } from './settings';

export interface HudSnapshot {
  fps: number;
  ping: number;
  mass: number;
  cells: number;
  rank: number;
  alive: boolean;
  leaderboard: LeaderboardEntry[];
  myId: number;
  players: number;
  mode: GameMode;
}

export interface DeathInfo {
  stats: PlayerStats;
  killer: string | null;
  timeAlive: number;
  finalMass: number;
}

export interface GameCallbacks {
  onHud?: (s: HudSnapshot) => void;
  onDeath?: (d: DeathInfo) => void;
  onAction?: (a: Action) => void;
}

export interface SessionOptions {
  mode: GameMode;
  botCount: number;
  seed?: number;
}

export interface SpawnOptions {
  name: string;
  skin: SkinId | null;
  color: string;
}

/**
 * Glues the pure simulation to the browser: fixed-step accumulator, render interpolation,
 * input mapping and HUD snapshots.
 */
export class Game {
  world!: World;
  bots!: BotController;
  readonly camera = new Camera();
  readonly renderer: Renderer;
  me: Player | null = null;

  private raf = 0;
  private last = 0;
  private acc = 0;
  private mouseX = 0;
  private mouseY = 0;
  private hudTimer = 0;
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;
  /** Input latency: time from a mouse sample to the simulation tick that consumes it. */
  private pendingInput = 0;
  private ping = 0;
  private spectateId = 0;
  private disposers: (() => void)[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    private getSettings: () => Settings,
    private cb: GameCallbacks = {},
  ) {
    this.renderer = new Renderer(canvas);
    this.mouseX = canvas.clientWidth / 2;
    this.mouseY = canvas.clientHeight / 2;
    this.bindInput();
  }

  /** Starts a fresh world (used for the menu backdrop and when a new game begins). */
  newSession(opts: SessionOptions) {
    this.world = new World({ mode: opts.mode, seed: opts.seed });
    this.world.recordEaten = true;
    this.bots = new BotController(this.world);
    this.world.populate();
    this.bots.addBots(opts.botCount);
    // Let the world settle so the backdrop is lively from the first frame.
    for (let i = 0; i < 60; i++) this.world.step(PHYSICS.STEP);
    this.me = null;
    this.camera.reset();
    this.acc = 0;
  }

  /** Spawns (or respawns) the human player. */
  spawn(opts: SpawnOptions) {
    const w = this.world;
    if (!this.me || !w.players.includes(this.me)) {
      this.me = w.addPlayer({ name: opts.name, skin: opts.skin, color: opts.color });
    } else {
      this.me.name = opts.name;
      this.me.skin = opts.skin;
      this.me.color = opts.color;
    }
    w.spawnPlayer(this.me, PHYSICS.PLAYER_START_MASS);
    this.camera.reset();
  }

  get isAlive() {
    return !!this.me?.alive;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose() {
    this.stop();
    for (const d of this.disposers) d();
    this.disposers = [];
  }

  /** Advances the simulation by real elapsed time and renders one frame. */
  frame(now: number) {
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.acc += dt;
    const step = PHYSICS.STEP;
    let ticks = 0;
    while (this.acc >= step && ticks < 15) {
      this.applyInput();
      this.world.step(step);
      this.acc -= step;
      ticks++;
      this.handleEvents();
    }
    if (ticks === 15) this.acc = 0;
    const alpha = this.acc / step;
    this.updateCamera(alpha, dt);
    const s = this.getSettings();
    this.renderer.render(this.world, this.camera, alpha, this.me, { theme: s.theme, hud: s.hud, animations: s.animations }, dt);

    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTimer);
      this.frames = 0;
      this.fpsTimer = 0;
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.2;
      this.cb.onHud?.(this.snapshot());
    }
  }

  snapshot(): HudSnapshot {
    const me = this.me;
    const w = this.world;
    return {
      fps: this.fps,
      ping: Math.round(this.ping * 10) / 10,
      mass: me?.alive ? Math.floor(w.totalMass(me)) : 0,
      cells: me?.cells.length ?? 0,
      rank: me ? w.rankOf(me) : 0,
      alive: !!me?.alive,
      leaderboard: w.leaderboard,
      myId: me?.id ?? -1,
      players: w.players.filter((p) => p.alive).length,
      mode: w.mode,
    };
  }

  private applyInput() {
    const me = this.me;
    if (!me?.alive) {
      // Nothing consumes input while dead / in the menu: drop stale samples.
      this.pendingInput = 0;
      return;
    }
    const s = this.getSettings();
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const sx = W / 2 + (this.mouseX - W / 2) * s.sensitivity;
    const sy = H / 2 + (this.mouseY - H / 2) * s.sensitivity;
    const t = this.camera.screenToWorld(sx, sy, W, H);
    me.targetX = t.x;
    me.targetY = t.y;
    if (this.pendingInput) {
      const lat = performance.now() - this.pendingInput;
      // Samples older than a few frames mean the loop was paused (hidden tab), not latency.
      if (lat < 250) this.ping = this.ping ? this.ping * 0.9 + lat * 0.1 : lat;
      this.pendingInput = 0;
    }
  }

  private handleEvents() {
    for (const ev of this.world.drainEvents()) {
      if (ev.type === 'death' && this.me && ev.playerId === this.me.id) {
        const st = this.me.stats;
        this.spectateId = 0;
        this.cb.onDeath?.({
          stats: { ...st },
          killer: ev.killer,
          timeAlive: st.diedAt - st.spawnedAt,
          finalMass: st.peakMass,
        });
      }
    }
  }

  private updateCamera(alpha: number, dt: number) {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    let target: Player | null | undefined = this.me?.alive ? this.me : null;
    if (!target) {
      // Spectate the current leader (menu backdrop / after death).
      target = this.world.players.find((p) => p.id === this.spectateId && p.alive);
      if (!target) {
        const lead = this.world.leaderboard[0];
        target = lead ? this.world.players.find((p) => p.id === lead.id) : undefined;
        this.spectateId = target?.id ?? 0;
      }
    }
    if (!target?.alive) return;
    const cells: CameraCell[] = target.cells.map((c) => ({
      x: c.px + (c.x - c.px) * alpha,
      y: c.py + (c.y - c.py) * alpha,
      radius: c.renderRadius,
    }));
    this.camera.update(cells, W, H, dt);
  }

  // ---------------------------------------------------------------- input

  private bindInput() {
    const on = <K extends keyof WindowEventMap>(t: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(window, 'mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      if (!this.pendingInput) this.pendingInput = performance.now();
    });
    on(this.canvas, 'wheel', (e) => {
      e.preventDefault();
      this.camera.wheel(e.deltaY);
    }, { passive: false });
    on(window, 'keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      const action = this.actionFor(e.code);
      if (!action) return;
      if (action !== 'menu') e.preventDefault();
      this.trigger(action, e.repeat);
    });
    on(window, 'keyup', (e) => {
      if (this.actionFor(e.code) === 'eject' && this.me) this.me.ejecting = false;
    });
    on(window, 'blur', () => {
      if (this.me) this.me.ejecting = false;
    });
  }

  private actionFor(code: string): Action | null {
    const keys = this.getSettings().keys;
    for (const [a, c] of Object.entries(keys)) if (c === code) return a as Action;
    return null;
  }

  /** Executes a bound action (public so UI buttons / tests can drive it). */
  trigger(action: Action, repeat = false) {
    if (action === 'menu') {
      if (!repeat) this.cb.onAction?.('menu');
      return;
    }
    const me = this.me;
    if (!me?.alive) return;
    switch (action) {
      case 'split':
        if (!repeat) this.world.requestSplit(me, 1);
        break;
      case 'doubleSplit':
        if (!repeat) this.world.requestSplit(me, 2);
        break;
      case 'maxSplit':
        if (!repeat) this.world.requestSplit(me, 4);
        break;
      case 'eject':
        me.ejecting = true;
        break;
    }
  }

  releaseEject() {
    if (this.me) this.me.ejecting = false;
  }
}
