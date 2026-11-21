import { PHYSICS } from './constants';
import { canEatByMass, massToRadius } from './math';
import type { SkinId } from './skins';
import type { Player } from './types';
import type { World } from './world';

export interface MinionLook {
  name: string;
  skin: SkinId | null;
  color: string;
}

interface Squad {
  look: MinionLook | null;
  minions: Player[];
  nextSpawn: number;
  /** Live minions last step, to notice deaths. */
  lastAlive: number;
}

/**
 * Bots mode: every regular player owns a small squad of minions. Minions are full players
 * (they eat, get eaten, split up to 16 cells) that steer toward their master's cursor and
 * split on their master's minion keys. They appear one at a time, and a dead minion is
 * replaced gradually, never in bulk.
 */
export class MinionController {
  private squads = new Map<number, Squad>();

  constructor(
    private world: World,
    readonly perPlayer: number = PHYSICS.MINIONS_PER_PLAYER,
    readonly interval: number = PHYSICS.MINION_SPAWN_INTERVAL,
  ) {
    world.beforeStep.push(this.update);
    // Masters (human and AI) respawn next to their biggest surviving minion.
    world.spawnLocator = (p, mass) => (p.master ? null : this.respawnPoint(p, mass));
  }

  /** Biggest live minion of `master`, or null if none survives. */
  biggestMinion(master: Player): Player | null {
    let best: Player | null = null;
    let bestMass = 0;
    for (const m of this.minionsOf(master)) {
      if (!m.alive) continue;
      const mass = this.world.totalMass(m);
      if (mass > bestMass) {
        bestMass = mass;
        best = m;
      }
    }
    return best;
  }

  /** Where `master` should respawn: close to its biggest live minion, or null (random safe spot). */
  respawnPoint(master: Player, mass: number) {
    const anchor = this.biggestMinion(master);
    return anchor ? spawnNear(this.world, anchor, mass) : null;
  }

  /** Name / skin / color for a player's minions (the human sets these in the menu). */
  configure(master: Player, look: MinionLook) {
    const squad = this.squadOf(master);
    squad.look = { ...look };
    for (const m of squad.minions) {
      m.name = look.name;
      m.skin = look.skin;
      m.color = look.color;
      for (const c of m.cells) c.color = look.color;
    }
  }

  minionsOf(master: Player): readonly Player[] {
    return this.squads.get(master.id)?.minions ?? [];
  }

  aliveMinions(master: Player) {
    return this.minionsOf(master).filter((m) => m.alive).length;
  }

  /** Queue `times` splits for every live minion of `master` (Space / double / x16 equivalents). */
  requestSplit(master: Player, times: number) {
    master.minionSplitQueue = Math.min(master.minionSplitQueue + times, 4);
  }

  private squadOf(master: Player) {
    let s = this.squads.get(master.id);
    if (!s) {
      // First minion shows up shortly after the squad is created, the rest one by one.
      s = { look: null, minions: [], nextSpawn: this.world.time + 1, lastAlive: 0 };
      this.squads.set(master.id, s);
    }
    return s;
  }

  update = (world: World) => {
    for (const master of world.players) {
      if (master.master) continue;
      const squad = this.squadOf(master);

      // Steer every live minion toward the master's cursor, apply queued splits and,
      // while the minion eject key is held, eject mass toward that same cursor.
      const splits = master.minionSplitQueue;
      master.minionSplitQueue = 0;
      const feeding = master.minionEjecting && master.alive;
      let alive = 0;
      for (const m of squad.minions) {
        if (!m.alive) {
          m.ejecting = false;
          continue;
        }
        alive++;
        m.targetX = master.targetX;
        m.targetY = master.targetY;
        if (splits > 0) world.requestSplit(m, splits);
        // Like a regular player's W: ejects toward the cursor the minion is steering to.
        m.ejecting = feeding;
      }

      // A minion died: its replacement waits a full interval.
      if (alive < squad.lastAlive) squad.nextSpawn = Math.max(squad.nextSpawn, world.time + this.interval);
      squad.lastAlive = alive;

      // Gradual (re)spawning, only while the master is in the game.
      if (!master.alive) {
        squad.nextSpawn = Math.max(squad.nextSpawn, world.time + this.interval);
        continue;
      }
      if (alive >= this.perPlayer || world.time < squad.nextSpawn) continue;
      const look = squad.look ?? { name: master.name, skin: master.skin, color: master.color };
      let minion = squad.minions.find((m) => !m.alive);
      if (!minion) {
        minion = world.addPlayer({ name: look.name, skin: look.skin, color: look.color, master });
        squad.minions.push(minion);
      } else {
        minion.name = look.name;
        minion.skin = look.skin;
        minion.color = look.color;
      }
      world.spawnPlayer(minion, PHYSICS.MINION_START_MASS, spawnNear(world, master, PHYSICS.MINION_START_MASS));
      minion.targetX = master.targetX;
      minion.targetY = master.targetY;
      squad.nextSpawn = world.time + this.interval;
      squad.lastAlive = alive + 1;
    }
  };
}

/**
 * A spot close to `anchor` (a master for new minions, the biggest minion for a respawning
 * master): a short gap outside one of its cells, never overlapping it nor next to any
 * cell big enough to eat the newcomer.
 */
export function spawnNear(world: World, anchor: Player, mass: number) {
  const r = massToRadius(mass);
  const margin = r + 20;
  let fallback: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const base = anchor.cells[Math.floor(world.rng() * anchor.cells.length)];
    const angle = world.rng() * Math.PI * 2;
    const gap = PHYSICS.MINION_SPAWN_GAP_MIN + world.rng() * (PHYSICS.MINION_SPAWN_GAP_MAX - PHYSICS.MINION_SPAWN_GAP_MIN);
    const d = base.radius + r + gap;
    const x = Math.min(world.mapSize - margin, Math.max(margin, base.x + Math.cos(angle) * d));
    const y = Math.min(world.mapSize - margin, Math.max(margin, base.y + Math.sin(angle) * d));
    fallback ??= { x, y };
    const blocked = world.players.some((p) =>
      p.cells.some((c) => {
        const dist = Math.hypot(c.x - x, c.y - y);
        if (dist < c.radius + r + 40) return p === anchor || canEatByMass(c.mass, mass) || canEatByMass(mass, c.mass);
        return canEatByMass(c.mass, mass) && dist < c.radius + r + 150;
      }),
    );
    if (!blocked) return { x, y };
  }
  return fallback!;
}
