import { PHYSICS } from './constants';
import { canEatByMass, massToRadius } from './math';
import { BOT_NAMES, CELL_COLORS } from './names';
import { pick, randRange } from './rng';
import { BOT_SKINS } from './skins';
import type { Entity, Player } from './types';
import type { World } from './world';

export interface BotBrain {
  nextThink: number;
  /** 0.5..1.5: how eagerly it chases and split-kills. */
  aggression: number;
  /** 0.7..1.6: how far it keeps from threats. */
  caution: number;
  wander: number;
  splitReadyAt: number;
  /** Last decision, exposed for debugging/tests. */
  intent: 'wander' | 'feed' | 'hunt' | 'flee' | 'split-kill' | 'shoot-virus' | 'regroup';
}

export interface Decision {
  targetX: number;
  targetY: number;
  split: boolean;
  eject: boolean;
  intent: BotBrain['intent'];
}

const THINK_MIN = 0.07;
const THINK_MAX = 0.14;

/** Drives every bot player of a world; registers itself as a world pre-step hook. */
export class BotController {
  readonly brains = new Map<number, BotBrain>();

  constructor(private world: World) {
    world.beforeStep.push(this.update);
  }

  /** Adds `count` bots with original names, random colors and occasional planet skins. */
  addBots(count: number) {
    const w = this.world;
    const used = new Set(w.players.map((p) => p.name));
    for (let i = 0; i < count; i++) {
      const free = BOT_NAMES.filter((n) => !used.has(n));
      let name = free.length ? pick(w.rng, free) : pick(w.rng, BOT_NAMES);
      if (used.has(name)) name = `${name} ${['II', 'III', 'IV', 'V'][Math.floor(w.rng() * 4)]}`;
      used.add(name);
      const skin = w.rng() < 0.25 ? pick(w.rng, BOT_SKINS) : null;
      const bot = w.addPlayer({ name, skin, color: pick(w.rng, CELL_COLORS), isBot: true });
      // Spread initial bots over a range of sizes so the leaderboard is lively from the start.
      w.spawnPlayer(bot, PHYSICS.START_MASS + Math.floor(w.rng() * w.rng() * 400));
    }
  }

  brainFor(p: Player): BotBrain {
    let b = this.brains.get(p.id);
    if (!b) {
      const rng = this.world.rng;
      b = {
        nextThink: 0,
        aggression: randRange(rng, 0.5, 1.5),
        caution: randRange(rng, 0.7, 1.6),
        wander: rng() * Math.PI * 2,
        splitReadyAt: 0,
        intent: 'wander',
      };
      this.brains.set(p.id, b);
    }
    return b;
  }

  update = (world: World) => {
    for (const p of world.players) {
      if (!p.isBot) continue;
      if (!p.alive) {
        if (world.time >= p.respawnAt) world.spawnPlayer(p);
        continue;
      }
      const brain = this.brainFor(p);
      if (world.time < brain.nextThink) continue;
      brain.nextThink = world.time + randRange(world.rng, THINK_MIN, THINK_MAX);
      const d = decide(world, p, brain);
      p.targetX = d.targetX;
      p.targetY = d.targetY;
      p.ejecting = d.eject;
      brain.intent = d.intent;
      if (d.split) {
        world.requestSplit(p);
        // Bots mode: send the squad in too (minions follow the same target).
        if (world.mode === 'bots') p.minionSplitQueue = Math.min(p.minionSplitQueue + 1, 4);
        brain.splitReadyAt = world.time + randRange(world.rng, 1.5, 3.5);
      }
    }
  };
}

interface Threat {
  e: Entity;
  gap: number;
  canSplitOnMe: boolean;
}

/** Pure decision function: looks at the world around the bot and picks a target/action. */
export function decide(world: World, p: Player, brain: BotBrain): Decision {
  const cells = p.cells;
  let largest = cells[0];
  let smallest = cells[0];
  let total = 0;
  let sumR = 0;
  let cx = 0;
  let cy = 0;
  for (const c of cells) {
    if (c.mass > largest.mass) largest = c;
    if (c.mass < smallest.mass) smallest = c;
    total += c.mass;
    sumR += c.radius;
    cx += c.x * c.mass;
    cy += c.y * c.mass;
  }
  cx /= total;
  cy /= total;

  // Same view extent a human of this size would get.
  const zoom = Math.pow(Math.min(64 / sumR, 1), 0.4);
  const viewR = 1000 / zoom;

  let fx = 0;
  let fy = 0;
  const add = (tx: number, ty: number, w: number) => {
    const dx = tx - cx;
    const dy = ty - cy;
    const d = Math.hypot(dx, dy) || 1;
    fx += (dx / d) * w;
    fy += (dy / d) * w;
  };

  const threats: Threat[] = [];
  const viruses: Entity[] = [];
  let splitTarget: Entity | null = null;
  let splitScore = 0;
  let bestPreyW = 0;
  const canSplit =
    cells.length < PHYSICS.MAX_CELLS && largest.mass >= PHYSICS.MIN_SPLIT_MASS && world.time >= brain.splitReadyAt;
  const half = largest.mass / 2;
  const halfR = massToRadius(half);

  world.grid.query(cx, cy, viewR, (e) => {
    if (e.removed || e.owner === p) return;
    const d = Math.max(Math.hypot(e.x - cx, e.y - cy), 1);
    switch (e.kind) {
      case 'food':
        add(e.x, e.y, (e.mass / (d * d)) * 3000);
        break;
      case 'eject':
        if (canEatByMass(largest.mass, e.mass)) add(e.x, e.y, (e.mass / (d * d)) * 4000);
        break;
      case 'virus': {
        viruses.push(e);
        if (canEatByMass(largest.mass, e.mass) && cells.length < PHYSICS.MAX_CELLS) {
          const near = nearestCell(cells, e);
          const gap = Math.hypot(e.x - near.x, e.y - near.y) - near.radius - e.radius;
          if (gap < 160) add(e.x, e.y, -3 * (1 - Math.max(gap, -80) / 160));
        }
        break;
      }
      case 'spawner': {
        if (canEatByMass(largest.mass, e.mass)) {
          add(e.x, e.y, ((e.mass / largest.mass) * 2 * brain.aggression) / (1 + d / 400));
        } else {
          const near = nearestCell(cells, e);
          const gap = Math.hypot(e.x - near.x, e.y - near.y) - near.radius - e.radius;
          if (canEatByMass(e.mass, smallest.mass) && gap < 220) add(e.x, e.y, -4 * (1 - gap / 220));
          // Pellets pour out of spawners: worth hovering around when small.
          else if (gap > 300) add(e.x, e.y, 0.15);
        }
        break;
      }
      case 'cell': {
        const near = nearestCell(cells, e);
        const gap = Math.hypot(e.x - near.x, e.y - near.y) - near.radius - e.radius;
        if (canEatByMass(e.mass, near.mass)) {
          const owner = e.owner!;
          const canSplitOnMe =
            e.mass >= PHYSICS.MIN_SPLIT_MASS &&
            owner.cells.length < PHYSICS.MAX_CELLS &&
            canEatByMass(e.mass / 2, near.mass);
          const range = (canSplitOnMe ? PHYSICS.SPLIT_BOOST * 0.9 : 350) * brain.caution;
          if (gap < range) {
            threats.push({ e, gap, canSplitOnMe });
            add(e.x, e.y, -8 * (1 - Math.max(gap, 0) / range) - 1);
          }
        } else if (canEatByMass(largest.mass, e.mass)) {
          const w = ((e.mass / largest.mass) * 2.5 * brain.aggression) / (1 + Math.max(gap, 0) / 400);
          add(e.x, e.y, w);
          bestPreyW = Math.max(bestPreyW, w);
          // Split-kill: the launched half must be able to eat it and reach it.
          if (canSplit && canEatByMass(half, e.mass) && e.mass >= Math.max(20, total * 0.05)) {
            const dl = Math.hypot(e.x - largest.x, e.y - largest.y);
            const reach = PHYSICS.SPLIT_BOOST * 0.8 + halfR;
            if (dl < reach) {
              const score = e.mass / dl;
              if (score > splitScore) {
                splitScore = score;
                splitTarget = e;
              }
            }
          }
        }
        break;
      }
    }
  });

  // Keep away from borders.
  const margin = 500 + largest.radius;
  const size = world.mapSize;
  if (cx < margin) fx += 4 * (1 - cx / margin);
  if (cx > size - margin) fx -= 4 * (1 - (size - cx) / margin);
  if (cy < margin) fy += 4 * (1 - cy / margin);
  if (cy > size - margin) fy -= 4 * (1 - (size - cy) / margin);

  // 1) Split-kill, only when no one nearby could eat the halves.
  if (splitTarget) {
    const t: Entity = splitTarget;
    const unsafe = threats.length > 0 || hasThreatTo(world, p, largest, half, 1600);
    const virusInPath = viruses.some(
      (v) => canEatByMass(half, v.mass) && pointSegmentDistance(v, largest, t) < v.radius + halfR * 0.5,
    );
    if (!unsafe && !virusInPath) {
      const lead = 0.35 * 60; // lead the prey by its current velocity (~0.35 s)
      return {
        targetX: t.x + (t.x - t.px) * lead,
        targetY: t.y + (t.y - t.py) * lead,
        split: true,
        eject: false,
        intent: 'split-kill',
      };
    }
  }

  // 2) Shoot a virus at a big threat lined up behind it.
  const worst = threats.sort((a, b) => a.gap - b.gap)[0];
  if (worst && total > 200 && largest.mass > 120) {
    for (const v of viruses) {
      const dv = Math.hypot(v.x - largest.x, v.y - largest.y);
      if (dv > largest.radius + 650) continue;
      if (!canEatByMass(worst.e.mass, PHYSICS.VIRUS_MASS)) break;
      const aV = Math.atan2(v.y - largest.y, v.x - largest.x);
      const aT = Math.atan2(worst.e.y - largest.y, worst.e.x - largest.x);
      const diff = Math.abs(angleDiff(aV, aT));
      const dvt = Math.hypot(worst.e.x - v.x, worst.e.y - v.y);
      if (diff < 0.25 && dvt < 900 && Math.hypot(worst.e.x - largest.x, worst.e.y - largest.y) > dv) {
        return { targetX: v.x, targetY: v.y, split: false, eject: true, intent: 'shoot-virus' };
      }
    }
  }

  // 3) Steering from the force field (flee / hunt / feed), or wander / regroup.
  const mag = Math.hypot(fx, fy);
  let intent: BotBrain['intent'] = threats.length ? 'flee' : bestPreyW > 0.3 ? 'hunt' : 'feed';
  if (mag < 0.002) {
    if (cells.length > 1 && world.time >= Math.min(...cells.map((c) => c.mergeAt))) {
      return { targetX: largest.x, targetY: largest.y, split: false, eject: false, intent: 'regroup' };
    }
    brain.wander += (world.rng() - 0.5) * 0.6;
    fx = Math.cos(brain.wander);
    fy = Math.sin(brain.wander);
    intent = 'wander';
  }
  const len = Math.hypot(fx, fy) || 1;
  const reach = Math.max(500, largest.radius * 2.5);
  return {
    targetX: world.clampToMap(cx + (fx / len) * reach),
    targetY: world.clampToMap(cy + (fy / len) * reach),
    split: false,
    eject: false,
    intent,
  };
}

function nearestCell(cells: Entity[], e: Entity) {
  let best = cells[0];
  let bd = Infinity;
  for (const c of cells) {
    const d = (c.x - e.x) ** 2 + (c.y - e.y) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function hasThreatTo(world: World, p: Player, from: Entity, mass: number, range: number) {
  let found = false;
  world.grid.query(from.x, from.y, range, (e) => {
    if (found || e.kind !== 'cell' || e.owner === p || e.removed) return;
    if (canEatByMass(e.mass, mass)) found = true;
  });
  return found;
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pointSegmentDistance(pt: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * abx + (pt.y - a.y) * aby) / len2));
  return Math.hypot(pt.x - (a.x + abx * t), pt.y - (a.y + aby * t));
}

export const randomBotColor = (world: World) => pick(world.rng, CELL_COLORS);
