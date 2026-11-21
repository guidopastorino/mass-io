import { PHYSICS, type GameMode } from './constants';
import { SpatialGrid } from './grid';
import {
  boostStep,
  canEatByMass,
  clamp,
  smoothing,
  eatDistance,
  massToRadius,
  recombineTime,
  speedForRadius,
} from './math';
import { CELL_COLORS, FOOD_COLORS } from './names';
import { createRng, pick, randRange, type Rng } from './rng';
import type { Entity, EntityKind, LeaderboardEntry, Player, WorldEvent, WorldOptions } from './types';

export interface AddPlayerOptions {
  name: string;
  skin?: string | null;
  color?: string;
  isBot?: boolean;
}

type StepHook = (world: World, dt: number) => void;

/**
 * Authoritative game simulation. Pure logic: no DOM, no rendering, driven by step(dt).
 */
export class World {
  readonly mode: GameMode;
  readonly mapSize: number;
  readonly rng: Rng;
  readonly foodTarget: number;
  readonly virusMin: number;
  readonly virusMax: number;
  readonly spawnerTarget: number;

  time = 0;
  entities: Entity[] = [];
  players: Player[] = [];
  readonly grid = new SpatialGrid(256);
  events: WorldEvent[] = [];
  leaderboard: LeaderboardEntry[] = [];
  /** Hooks run at the start of every step (bot AI). */
  readonly beforeStep: StepHook[] = [];
  /** Absorptions since the last drain, so the renderer can animate prey being swallowed. */
  eaten: { prey: Entity; pred: Entity }[] = [];
  /** Only a renderer needs absorption records; headless simulations skip them. */
  recordEaten = false;

  foodCount = 0;
  virusCount = 0;
  spawnerCount = 0;

  private nextId = 1;
  private foodAcc = 0;
  private virusAcc = 0;
  private lbTimer = 0;

  constructor(opts: WorldOptions) {
    this.mode = opts.mode;
    this.rng = createRng(opts.seed ?? Date.now());
    this.mapSize = opts.mapSize ?? PHYSICS.MAP_SIZE;
    this.foodTarget = opts.foodTarget ?? PHYSICS.FOOD_TARGET;
    this.virusMin = opts.virusMin ?? PHYSICS.VIRUS_MIN_COUNT;
    this.virusMax = opts.virusMax ?? PHYSICS.VIRUS_MAX_COUNT;
    this.spawnerTarget = opts.mode === 'experimental' ? (opts.spawnerCount ?? PHYSICS.SPAWNER_COUNT) : 0;
  }

  /** Fills the map with its initial food, viruses and spawners. */
  populate() {
    while (this.foodCount < this.foodTarget) this.spawnFood();
    while (this.virusCount < this.virusMin) this.spawnVirusRandom();
    while (this.spawnerCount < this.spawnerTarget) this.spawnSpawnerRandom();
  }

  // ---------------------------------------------------------------- entities

  createEntity(kind: EntityKind, x: number, y: number, mass: number, color: string): Entity {
    const radius = massToRadius(mass);
    const e: Entity = {
      id: this.nextId++,
      kind,
      x,
      y,
      px: x,
      py: y,
      mass,
      radius,
      color,
      boost: 0,
      bdx: 0,
      bdy: 0,
      born: this.time,
      removed: false,
      owner: null,
      mergeAt: 0,
      feed: 0,
      nextGrow: 0,
      shooterId: 0,
      acc: 0,
      renderRadius: radius,
    };
    this.entities.push(e);
    if (kind === 'food') this.foodCount++;
    else if (kind === 'virus') this.virusCount++;
    else if (kind === 'spawner') this.spawnerCount++;
    return e;
  }

  setMass(e: Entity, mass: number) {
    e.mass = mass;
    e.radius = massToRadius(mass);
  }

  private remove(e: Entity) {
    if (e.removed) return;
    e.removed = true;
    if (e.kind === 'food') this.foodCount--;
    else if (e.kind === 'virus') this.virusCount--;
    else if (e.kind === 'spawner') this.spawnerCount--;
    if (e.owner) {
      const cells = e.owner.cells;
      const i = cells.indexOf(e);
      if (i >= 0) cells.splice(i, 1);
    }
  }

  setBoost(e: Entity, angle: number, distance: number) {
    e.bdx = Math.cos(angle);
    e.bdy = Math.sin(angle);
    e.boost = distance;
  }

  randomPosition(margin = 0) {
    return {
      x: randRange(this.rng, margin, this.mapSize - margin),
      y: randRange(this.rng, margin, this.mapSize - margin),
    };
  }

  spawnFood(x?: number, y?: number, mass?: number): Entity {
    const pos = x === undefined || y === undefined ? this.randomPosition(20) : { x, y };
    const m = mass ?? (this.rng() < 0.85 ? PHYSICS.FOOD_MIN_MASS : PHYSICS.FOOD_MIN_MASS + 1);
    const f = this.createEntity('food', pos.x, pos.y, m, pick(this.rng, FOOD_COLORS));
    f.nextGrow = this.time + PHYSICS.FOOD_GROW_INTERVAL * randRange(this.rng, 0.5, 1.5);
    return f;
  }

  spawnVirusRandom(): Entity | null {
    // Pick a spot that doesn't overlap a player cell.
    for (let attempt = 0; attempt < 10; attempt++) {
      const pos = this.randomPosition(200);
      const r = massToRadius(PHYSICS.VIRUS_MASS);
      const blocked = this.players.some((p) =>
        p.cells.some((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < c.radius + r + 50),
      );
      if (!blocked) return this.createEntity('virus', pos.x, pos.y, PHYSICS.VIRUS_MASS, '#33dd55');
    }
    return null;
  }

  spawnSpawnerRandom(): Entity {
    const pos = this.randomPosition(400);
    return this.createEntity('spawner', pos.x, pos.y, PHYSICS.SPAWNER_MASS, '#ce6363');
  }

  // ---------------------------------------------------------------- players

  addPlayer(opts: AddPlayerOptions): Player {
    const p: Player = {
      id: this.nextId++,
      name: opts.name,
      skin: opts.skin ?? null,
      color: opts.color ?? pick(this.rng, CELL_COLORS),
      isBot: opts.isBot ?? false,
      alive: false,
      cells: [],
      targetX: 0,
      targetY: 0,
      splitQueue: 0,
      ejecting: false,
      lastEject: -Infinity,
      respawnAt: 0,
      stats: emptyStats(0),
      killedBy: null,
    };
    this.players.push(p);
    return p;
  }

  removePlayer(p: Player) {
    for (const c of [...p.cells]) this.remove(c);
    this.players = this.players.filter((q) => q !== p);
  }

  /** Spawns the player with a single starting cell at the safest of several random spots. */
  spawnPlayer(p: Player, mass: number = PHYSICS.START_MASS, at?: { x: number; y: number }): Entity {
    for (const c of [...p.cells]) this.remove(c);
    const pos = at ?? this.findSafeSpawn(mass);
    const cell = this.addCell(p, pos.x, pos.y, mass);
    p.alive = true;
    p.targetX = pos.x;
    p.targetY = pos.y;
    p.splitQueue = 0;
    p.ejecting = false;
    p.killedBy = null;
    p.stats = emptyStats(this.time);
    p.stats.peakMass = mass;
    return cell;
  }

  addCell(p: Player, x: number, y: number, mass: number): Entity {
    const cell = this.createEntity('cell', x, y, mass, p.color);
    cell.owner = p;
    p.cells.push(cell);
    return cell;
  }

  private findSafeSpawn(mass: number) {
    let best = this.randomPosition(300);
    let bestScore = -Infinity;
    for (let i = 0; i < 24; i++) {
      const pos = this.randomPosition(300);
      let score = Infinity;
      for (const p of this.players) {
        for (const c of p.cells) {
          if (c.mass < mass * PHYSICS.EAT_MASS_RATIO) continue;
          score = Math.min(score, Math.hypot(c.x - pos.x, c.y - pos.y) - c.radius);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = pos;
      }
      if (score > 2500) break;
    }
    return best;
  }

  totalMass(p: Player) {
    let m = 0;
    for (const c of p.cells) m += c.mass;
    return m;
  }

  /** Queue a split (Space). Each queued split is processed on its own tick, like the reference servers. */
  requestSplit(p: Player, times = 1) {
    p.splitQueue = Math.min(p.splitQueue + times, 4);
  }

  // ---------------------------------------------------------------- actions

  /** Splits `cell` sending a new cell of `mass` in direction `angle`. */
  splitCell(cell: Entity, angle: number, mass: number, boost: number = PHYSICS.SPLIT_BOOST): Entity | null {
    const p = cell.owner;
    if (!p || p.cells.length >= PHYSICS.MAX_CELLS) return null;
    this.setMass(cell, cell.mass - mass);
    const child = this.addCell(p, cell.x, cell.y, mass);
    this.setBoost(child, angle, boost);
    child.mergeAt = this.time + recombineTime(mass);
    cell.mergeAt = Math.max(cell.mergeAt, this.time + recombineTime(cell.mass));
    return child;
  }

  private processSplit(p: Player) {
    const snapshot = [...p.cells].sort((a, b) => b.mass - a.mass);
    for (const c of snapshot) {
      if (p.cells.length >= PHYSICS.MAX_CELLS) break;
      if (c.mass < PHYSICS.MIN_SPLIT_MASS) continue;
      const angle = this.aimAngle(p, c);
      this.splitCell(c, angle, c.mass / 2);
    }
  }

  private aimAngle(p: Player, c: Entity) {
    const dx = p.targetX - c.x;
    const dy = p.targetY - c.y;
    if (dx * dx + dy * dy < 1) return c.boost > 0 ? Math.atan2(c.bdy, c.bdx) : this.rng() * Math.PI * 2;
    return Math.atan2(dy, dx);
  }

  private processEject(p: Player) {
    for (const c of [...p.cells]) {
      if (c.mass < PHYSICS.MIN_EJECT_MASS) continue;
      const angle = this.aimAngle(p, c) + (this.rng() * 2 - 1) * PHYSICS.EJECT_SPREAD;
      this.setMass(c, c.mass - PHYSICS.EJECT_MASS_LOSS);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const e = this.createEntity('eject', c.x + dx * c.radius, c.y + dy * c.radius, PHYSICS.EJECT_MASS, c.color);
      this.setBoost(e, angle, PHYSICS.EJECT_BOOST);
      e.shooterId = p.id;
    }
    p.lastEject = this.time;
  }

  // ---------------------------------------------------------------- step

  step(dt: number) {
    this.time += dt;
    for (const hook of this.beforeStep) hook(this, dt);

    const ents = this.entities;
    for (let i = 0; i < ents.length; i++) {
      ents[i].px = ents[i].x;
      ents[i].py = ents[i].y;
    }

    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.splitQueue > 0) {
        p.splitQueue--;
        this.processSplit(p);
      }
      if (p.ejecting && this.time - p.lastEject >= PHYSICS.EJECT_COOLDOWN) this.processEject(p);
    }

    this.moveEntities(dt);
    this.resolveSiblingCollisions(dt);
    this.applyBorders();
    this.rebuildGrid();
    this.resolveEating();
    this.decay(dt);
    this.updateSpecial(dt);
    this.enforceMaxCellMass();
    this.compact();
    this.replenish(dt);
    this.updatePlayers();

    this.lbTimer -= dt;
    if (this.lbTimer <= 0) {
      this.lbTimer = 0.5;
      this.updateLeaderboard();
    }
  }

  private moveEntities(dt: number) {
    for (const e of this.entities) {
      if (e.removed) continue;
      if (e.boost > 0) {
        const s = boostStep(e.boost, dt);
        e.x += e.bdx * s;
        e.y += e.bdy * s;
        e.boost -= s;
        if (e.boost < 0.5) e.boost = 0;
      }
      if (e.kind === 'cell' && e.owner) {
        const p = e.owner;
        const dx = p.targetX - e.x;
        const dy = p.targetY - e.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0.01) {
          // Full speed while the cursor is outside the cell; eases in linearly as the
          // cursor gets closer than one radius, so the cell glides to a stop instead of snapping.
          const ease = Math.min(1, d / Math.max(e.radius, PHYSICS.MOVE_EASE_MIN));
          const move = Math.min(d, speedForRadius(e.radius) * ease * dt);
          e.x += (dx / d) * move;
          e.y += (dy / d) * move;
        }
      }
    }
  }

  /**
   * Sibling cells that cannot merge yet push each other apart (mass-weighted).
   * The correction is soft (a fraction of the overlap per step, frame-rate independent)
   * and fades in over SPLIT_NO_COLLIDE after a split, so pieces glide apart instead of
   * being shoved the instant the no-collision window ends.
   */
  private resolveSiblingCollisions(dt: number) {
    const nc = PHYSICS.SPLIT_NO_COLLIDE;
    const soft = smoothing(PHYSICS.RIGID_RATE, dt);
    for (const p of this.players) {
      const cells = p.cells;
      for (let i = 0; i < cells.length; i++) {
        const a = cells[i];
        for (let j = i + 1; j < cells.length; j++) {
          const b = cells[j];
          if (this.time >= a.mergeAt && this.time >= b.mergeAt) continue;
          const youngest = this.time - Math.max(a.born, b.born);
          const ramp = youngest >= nc ? 1 : (youngest / nc) ** 2;
          if (ramp <= 0) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.sqrt(dx * dx + dy * dy);
          const overlap = a.radius + b.radius - d;
          if (overlap <= 0) continue;
          if (d < 0.001) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const nx = dx / d;
          const ny = dy / d;
          const total = a.mass + b.mass;
          const k = overlap * soft * ramp;
          const pa = k * (b.mass / total);
          const pb = k * (a.mass / total);
          a.x -= nx * pa;
          a.y -= ny * pa;
          b.x += nx * pb;
          b.y += ny * pb;
        }
      }
    }
  }

  private applyBorders() {
    const max = this.mapSize;
    for (const e of this.entities) {
      if (e.removed) continue;
      const m = e.kind === 'cell' ? e.radius / 2 : e.radius;
      if (e.x < m) {
        e.x = m;
        if (e.boost > 0) e.bdx = Math.abs(e.bdx);
      } else if (e.x > max - m) {
        e.x = max - m;
        if (e.boost > 0) e.bdx = -Math.abs(e.bdx);
      }
      if (e.y < m) {
        e.y = m;
        if (e.boost > 0) e.bdy = Math.abs(e.bdy);
      } else if (e.y > max - m) {
        e.y = max - m;
        if (e.boost > 0) e.bdy = -Math.abs(e.bdy);
      }
    }
  }

  rebuildGrid() {
    this.grid.clear();
    for (const e of this.entities) if (!e.removed) this.grid.insert(e);
  }

  private resolveEating() {
    const predators = this.entities.filter(
      (e) => !e.removed && (e.kind === 'cell' || e.kind === 'virus' || e.kind === 'spawner'),
    );
    predators.sort((a, b) => b.mass - a.mass);
    for (const pred of predators) {
      if (pred.removed) continue;
      this.grid.query(pred.x, pred.y, pred.radius, (prey) => {
        if (prey === pred || prey.removed || pred.removed) return;
        const dx = prey.x - pred.x;
        const dy = prey.y - pred.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= pred.radius * pred.radius) return;
        const ed = eatDistance(pred.radius, prey.radius);
        if (ed <= 0 || d2 >= ed * ed) return;
        if (pred.kind === 'cell') this.cellEats(pred, prey);
        else if (pred.kind === 'virus') this.virusEats(pred, prey);
        else this.spawnerEats(pred, prey);
      });
    }
  }

  private cellEats(cell: Entity, prey: Entity) {
    const p = cell.owner!;
    switch (prey.kind) {
      case 'food':
        this.absorb(cell, prey);
        p.stats.foodEaten++;
        break;
      case 'eject':
        if (!canEatByMass(cell.mass, prey.mass)) return;
        this.absorb(cell, prey);
        break;
      case 'virus':
        if (!canEatByMass(cell.mass, prey.mass)) return;
        this.absorb(cell, prey);
        p.stats.virusesEaten++;
        this.popCell(cell);
        break;
      case 'spawner':
        // Behaves like a virus when eaten: grants its mass and pops the cell.
        if (!canEatByMass(cell.mass, prey.mass)) return;
        this.absorb(cell, prey);
        p.stats.virusesEaten++;
        this.popCell(cell);
        break;
      case 'cell': {
        if (prey.owner === p) {
          if (this.time < cell.mergeAt || this.time < prey.mergeAt) return;
          if (cell.mass < prey.mass) return;
          this.absorb(cell, prey);
          return;
        }
        if (!canEatByMass(cell.mass, prey.mass)) return;
        const victim = prey.owner!;
        this.absorb(cell, prey);
        p.stats.cellsEaten++;
        if (victim.cells.length === 0) victim.killedBy = p.name;
        this.events.push({ type: 'eat', predatorId: p.id, preyId: victim.id });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- viruses

  /** A virus swallows ejected mass. FFA: grows and shoots a new virus. Experimental: gets pushed. */
  private virusEats(virus: Entity, prey: Entity) {
    if (prey.kind !== 'eject') return;
    const angle = feedAngle(prey, virus);
    this.remove(prey);
    if (this.mode === 'experimental') {
      // Accumulate push along the feed direction (vector sum keeps momentum coherent).
      const vx = virus.bdx * virus.boost + Math.cos(angle) * PHYSICS.VIRUS_PUSH;
      const vy = virus.bdy * virus.boost + Math.sin(angle) * PHYSICS.VIRUS_PUSH;
      const len = Math.hypot(vx, vy);
      if (len > 0) {
        virus.bdx = vx / len;
        virus.bdy = vy / len;
        virus.boost = Math.min(len, PHYSICS.VIRUS_SHOT_BOOST);
      }
      return;
    }
    this.setMass(virus, virus.mass + prey.mass);
    virus.feed++;
    if (virus.feed >= PHYSICS.VIRUS_FEED_SHOTS) {
      virus.feed = 0;
      this.setMass(virus, PHYSICS.VIRUS_MASS);
      if (this.virusCount < this.virusMax) {
        const shot = this.createEntity('virus', virus.x, virus.y, PHYSICS.VIRUS_MASS, virus.color);
        this.setBoost(shot, angle, PHYSICS.VIRUS_SHOT_BOOST);
      }
    }
  }

  /**
   * A cell that swallowed a virus explodes into many pieces (up to MAX_CELLS).
   * Piece distribution follows the reference algorithm: halves of the remaining
   * mass, falling back to equal small pieces when mass runs short.
   */
  popCell(cell: Entity) {
    const p = cell.owner!;
    let cellsLeft = PHYSICS.MAX_CELLS - p.cells.length;
    if (cellsLeft <= 0) return;
    const splitMin = PHYSICS.MIN_SPLIT_MASS;
    const cellMass = cell.mass;
    const splits: number[] = [];
    if (cellMass / cellsLeft < splitMin) {
      let count = 2;
      let mass = cellMass / count;
      while (mass > splitMin && count * 2 < cellsLeft) {
        count *= 2;
        mass = cellMass / count;
      }
      mass = cellMass / (count + 1);
      while (count-- > 0) splits.push(mass);
    } else {
      let massLeft = cellMass / 2;
      let mass = cellMass / 2;
      while (cellsLeft-- > 0) {
        // cellsLeft was already decremented for this iteration: +1 pieces remain.
        if (massLeft / (cellsLeft + 1) < splitMin) {
          mass = massLeft / (cellsLeft + 1);
          for (let i = 0; i <= cellsLeft; i++) splits.push(mass);
          break;
        }
        while (mass >= massLeft && cellsLeft > 0) mass /= 2;
        splits.push(mass);
        massLeft -= mass;
      }
    }
    for (const m of splits) {
      if (cell.mass - m < 1) break;
      this.splitCell(cell, this.rng() * Math.PI * 2, m);
    }
  }

  // ---------------------------------------------------------------- spawners (experimental)

  /** Spawners swallow ejected mass and smaller player cells, then redistribute it as pellets. */
  private spawnerEats(spawner: Entity, prey: Entity) {
    if (prey.kind === 'eject') {
      this.absorb(spawner, prey);
    } else if (prey.kind === 'cell' && canEatByMass(spawner.mass, prey.mass)) {
      const victim = prey.owner!;
      this.absorb(spawner, prey);
      if (victim.cells.length === 0) victim.killedBy = 'Spawner';
    }
  }

  private updateSpecial(dt: number) {
    if (this.spawnerCount === 0) return;
    const pelletCap = this.foodTarget * 1.5 + 200;
    for (const s of this.entities) {
      if (s.kind !== 'spawner' || s.removed) continue;
      // passive production at base size
      s.acc += PHYSICS.SPAWNER_PASSIVE_RATE * dt;
      // redistribution of absorbed mass
      const excess = s.mass - PHYSICS.SPAWNER_MASS;
      if (excess > 0) s.acc += PHYSICS.SPAWNER_RELEASE_RATE * dt;
      while (s.acc >= 1) {
        s.acc -= 1;
        if (this.foodCount >= pelletCap) {
          s.acc = 0;
          break;
        }
        const over = s.mass - PHYSICS.SPAWNER_MASS;
        const m = over > 0 ? Math.min(over, randRange(this.rng, 1, PHYSICS.FOOD_MAX_MASS)) : PHYSICS.FOOD_MIN_MASS;
        if (over > 0) this.setMass(s, s.mass - m);
        const angle = this.rng() * Math.PI * 2;
        const f = this.spawnFood(s.x + Math.cos(angle) * s.radius, s.y + Math.sin(angle) * s.radius, m);
        this.setBoost(f, angle, PHYSICS.SPAWNER_PELLET_BOOST * randRange(this.rng, 0.4, 1.2));
      }
    }
  }

  absorb(pred: Entity, prey: Entity) {
    if (this.recordEaten) this.eaten.push({ prey, pred });
    this.setMass(pred, pred.mass + prey.mass);
    if (pred.owner) pred.owner.stats.massEaten += prey.mass;
    this.remove(prey);
  }

  private decay(dt: number) {
    const k = Math.exp(-PHYSICS.DECAY_RATE * dt);
    for (const p of this.players) {
      for (const c of p.cells) {
        if (c.mass > PHYSICS.DECAY_MIN_MASS) this.setMass(c, Math.max(PHYSICS.DECAY_MIN_MASS, c.mass * k));
      }
    }
  }

  private enforceMaxCellMass() {
    for (const p of this.players) {
      for (const c of [...p.cells]) {
        if (c.mass <= PHYSICS.MAX_CELL_MASS) continue;
        if (p.cells.length < PHYSICS.MAX_CELLS) this.splitCell(c, this.aimAngle(p, c), c.mass / 2);
        else this.setMass(c, PHYSICS.MAX_CELL_MASS);
      }
    }
  }

  private compact() {
    let w = 0;
    const ents = this.entities;
    for (let i = 0; i < ents.length; i++) if (!ents[i].removed) ents[w++] = ents[i];
    ents.length = w;
  }

  private replenish(dt: number) {
    this.foodAcc += PHYSICS.FOOD_SPAWN_PER_SECOND * dt;
    while (this.foodAcc >= 1) {
      this.foodAcc -= 1;
      if (this.foodCount < this.foodTarget) this.spawnFood();
    }
    // Pellets slowly grow while uneaten.
    for (const e of this.entities) {
      if (e.kind !== 'food' || e.mass >= PHYSICS.FOOD_MAX_MASS || this.time < e.nextGrow) continue;
      this.setMass(e, e.mass + 1);
      e.nextGrow = this.time + PHYSICS.FOOD_GROW_INTERVAL * randRange(this.rng, 0.5, 1.5);
    }
    if (this.virusCount < this.virusMin) {
      this.virusAcc += dt;
      if (this.virusAcc >= 0.5) {
        this.virusAcc = 0;
        this.spawnVirusRandom();
      }
    }
    if (this.spawnerCount < this.spawnerTarget) this.spawnSpawnerRandom();
  }

  private updatePlayers() {
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.cells.length === 0) {
        p.alive = false;
        p.stats.diedAt = this.time;
        p.respawnAt = this.time + randRange(this.rng, 2, 5);
        this.events.push({ type: 'death', playerId: p.id, killer: p.killedBy });
        continue;
      }
      const m = this.totalMass(p);
      if (m > p.stats.peakMass) p.stats.peakMass = m;
    }
  }

  updateLeaderboard() {
    const alive = this.players.filter((p) => p.alive);
    const ranked = alive
      .map((p) => ({ id: p.id, name: p.name, mass: this.totalMass(p), isHuman: !p.isBot }))
      .sort((a, b) => b.mass - a.mass);
    ranked.forEach((entry, i) => {
      const p = alive.find((q) => q.id === entry.id)!;
      if (p.stats.bestRank === 0 || i + 1 < p.stats.bestRank) p.stats.bestRank = i + 1;
    });
    this.leaderboard = ranked.slice(0, 10);
  }

  rankOf(p: Player) {
    if (!p.alive) return 0;
    const m = this.totalMass(p);
    return 1 + this.players.filter((q) => q.alive && q !== p && this.totalMass(q) > m).length;
  }

  drainEaten() {
    const list = this.eaten;
    this.eaten = [];
    return list;
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  /** Clamp helper exported for camera/AI code that needs map bounds. */
  clampToMap(v: number) {
    return clamp(v, 0, this.mapSize);
  }
}

function emptyStats(now: number) {
  return {
    spawnedAt: now,
    diedAt: 0,
    peakMass: 0,
    foodEaten: 0,
    cellsEaten: 0,
    virusesEaten: 0,
    bestRank: 0,
    massEaten: 0,
  };
}

/** Direction the fed virus moves / shoots: the blob's travel direction, else blob -> virus. */
function feedAngle(blob: Entity, virus: Entity) {
  if (blob.boost > 0) return Math.atan2(blob.bdy, blob.bdx);
  return Math.atan2(virus.y - blob.y, virus.x - blob.x);
}
