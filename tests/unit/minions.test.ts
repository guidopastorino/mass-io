import { describe, expect, it } from 'vitest';
import { BotController } from '../../src/engine/bots';
import { PHYSICS } from '../../src/engine/constants';
import { recombineTime } from '../../src/engine/math';
import { MinionController } from '../../src/engine/minions';
import { World } from '../../src/engine/world';
import { emptyWorld, run } from './helpers';

function botsWorld() {
  const w = emptyWorld('bots');
  const ctl = new MinionController(w);
  const me = w.addPlayer({ name: 'me' });
  // Same mass as a minion, so the master can't swallow minions converging on its cursor.
  w.spawnPlayer(me, PHYSICS.MINION_START_MASS, { x: 5000, y: 5000 });
  me.targetX = 5000;
  me.targetY = 5000;
  return { w, ctl, me };
}

describe('bots mode', () => {
  it('cells recombine faster than in FFA', () => {
    const ffa = emptyWorld('ffa');
    const bots = emptyWorld('bots');
    for (const w of [ffa, bots]) {
      const p = w.addPlayer({ name: 'p' });
      w.spawnPlayer(p, 400, { x: 5000, y: 5000 });
      p.targetX = p.targetY = 5000;
      w.requestSplit(p);
      w.step(1 / 60);
    }
    const ffaMerge = ffa.players[0].cells[1].mergeAt;
    const botsMerge = bots.players[0].cells[1].mergeAt;
    expect(botsMerge).toBeCloseTo(ffaMerge * PHYSICS.BOTS_MODE_RECOMBINE_SCALE, 1);
    expect(botsMerge).toBeLessThan(recombineTime(200) / 2);
    const p = bots.players[0];
    run(bots, botsMerge + 3);
    expect(p.cells).toHaveLength(1);
  });

  it('minions appear one at a time up to the cap, with the configured look', () => {
    const { w, ctl, me } = botsWorld();
    ctl.configure(me, { name: 'Minion', skin: 'galaxy', color: '#ff4d6d' });
    expect(ctl.aliveMinions(me)).toBe(0);
    run(w, 1.1);
    expect(ctl.aliveMinions(me)).toBe(1);
    run(w, PHYSICS.MINION_SPAWN_INTERVAL);
    expect(ctl.aliveMinions(me)).toBe(2);
    run(w, PHYSICS.MINION_SPAWN_INTERVAL * 3);
    expect(ctl.aliveMinions(me)).toBe(PHYSICS.MINIONS_PER_PLAYER);
    for (const m of ctl.minionsOf(me)) {
      expect(m.name).toBe('Minion');
      expect(m.skin).toBe('galaxy');
      expect(m.master).toBe(me);
      expect(m.cells[0].color).toBe('#ff4d6d');
    }
  });

  it('minions follow the master cursor', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1.1);
    const m = ctl.minionsOf(me)[0];
    me.targetX = 9000;
    me.targetY = 9000;
    const before = Math.hypot(m.cells[0].x - 9000, m.cells[0].y - 9000);
    run(w, 1);
    expect(m.targetX).toBe(9000);
    expect(Math.hypot(m.cells[0].x - 9000, m.cells[0].y - 9000)).toBeLessThan(before - 200);
  });

  it('minion keys split all live minions (1, 2 and 4 splits)', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1 + PHYSICS.MINION_SPAWN_INTERVAL * 2 + 0.1);
    const minions = ctl.minionsOf(me).filter((m) => m.alive);
    expect(minions).toHaveLength(3);
    // keep the master away from its now-huge minions so it isn't eaten
    me.cells[0].x = me.cells[0].px = 1000;
    me.cells[0].y = me.cells[0].py = 1000;
    for (const m of minions) w.setMass(m.cells[0], 2000);
    ctl.requestSplit(me, 1);
    run(w, 0.1);
    for (const m of minions) expect(m.cells).toHaveLength(2);
    ctl.requestSplit(me, 2);
    run(w, 0.1);
    for (const m of minions) expect(m.cells).toHaveLength(8);
    ctl.requestSplit(me, 4);
    run(w, 0.2);
    for (const m of minions) expect(m.cells).toHaveLength(16);
    // the master itself did not split
    expect(me.cells).toHaveLength(1);
  });

  it('everyone eats everyone: master, minions and siblings', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1 + PHYSICS.MINION_SPAWN_INTERVAL * 2 + PHYSICS.MINION_SPAWN_GRACE + 0.1);
    const [m1, m2, m3] = ctl.minionsOf(me);
    for (const m of [m1, m2, m3]) expect(m.alive).toBe(true);
    const place = (c: { x: number; y: number; px: number; py: number }, x: number, y: number) => {
      c.x = c.px = x;
      c.y = c.py = y;
    };
    me.targetX = me.targetY = 3000;
    // master eats its own minion
    w.setMass(me.cells[0], 1000);
    place(me.cells[0], 3000, 3000);
    place(m1.cells[0], 3000, 3000);
    w.step(1 / 60);
    expect(m1.alive).toBe(false);
    expect(me.cells[0].mass).toBeGreaterThan(1090);
    // a minion eats its sibling
    w.setMass(m2.cells[0], 1000);
    place(m2.cells[0], 7000, 7000);
    place(m3.cells[0], 7000, 7000);
    w.step(1 / 60);
    expect(m3.alive).toBe(false);
    // a minion eats its master
    w.setMass(me.cells[0], 100);
    w.setMass(m2.cells[0], 2000);
    place(me.cells[0], 5000, 2000);
    place(m2.cells[0], 5000, 2000);
    w.step(1 / 60);
    expect(me.alive).toBe(false);
    expect(me.killedBy).toBe(m2.name);
  });

  it('a just-spawned minion is briefly safe from its own squad only', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1.05);
    const m = ctl.minionsOf(me)[0];
    w.setMass(me.cells[0], 1000);
    me.cells[0].x = m.cells[0].x;
    me.cells[0].y = m.cells[0].y;
    me.targetX = m.cells[0].x;
    me.targetY = m.cells[0].y;
    w.step(1 / 60);
    expect(m.alive).toBe(true);
    run(w, PHYSICS.MINION_SPAWN_GRACE);
    expect(m.alive).toBe(false);
  });

  it('other players can eat minions at any time', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1.05);
    const m = ctl.minionsOf(me)[0];
    const enemy = w.addPlayer({ name: 'enemy' });
    w.spawnPlayer(enemy, 2000, { x: m.cells[0].x, y: m.cells[0].y });
    enemy.targetX = m.cells[0].x;
    enemy.targetY = m.cells[0].y;
    w.step(1 / 60);
    expect(m.alive).toBe(false);
    expect(m.killedBy).toBe('enemy');
  });

  it('a dead minion is replaced gradually, not instantly', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1 + PHYSICS.MINION_SPAWN_INTERVAL * 3);
    expect(ctl.aliveMinions(me)).toBe(3);
    const victim = ctl.minionsOf(me)[0];
    // remove only this minion's cells (as if eaten far from the others)
    const sink = w.createEntity('spawner', 0, 0, 1, '#000');
    for (const c of [...victim.cells]) w.absorb(sink, c);
    w.step(1 / 60);
    expect(victim.alive).toBe(false);
    run(w, 1);
    expect(ctl.aliveMinions(me)).toBe(2);
    run(w, PHYSICS.MINION_SPAWN_INTERVAL);
    expect(ctl.aliveMinions(me)).toBe(3);
    // the dead minion object was reused, not duplicated
    expect(ctl.minionsOf(me)).toHaveLength(3);
  });

  it('no new minions spawn while the master is dead', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1.1);
    for (const c of [...me.cells]) w.absorb(w.createEntity('spawner', 0, 0, 1, '#000'), c);
    w.step(1 / 60);
    expect(me.alive).toBe(false);
    run(w, PHYSICS.MINION_SPAWN_INTERVAL * 3);
    expect(ctl.aliveMinions(me)).toBe(1);
  });

  it('minions stay off the leaderboard and out of rank', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1 + PHYSICS.MINION_SPAWN_INTERVAL * 3);
    for (const m of ctl.minionsOf(me)) w.setMass(m.cells[0], 5000);
    w.updateLeaderboard();
    expect(w.leaderboard.map((e) => e.name)).toEqual(['me']);
    expect(w.rankOf(me)).toBe(1);
  });

  it('minions spawn close to their master, never on top of it', () => {
    const w = emptyWorld('bots');
    const ctl = new MinionController(w);
    const me = w.addPlayer({ name: 'me' });
    w.spawnPlayer(me, 1000, { x: 5000, y: 5000 });
    me.targetX = 9000; // master keeps moving; minions still appear around it
    me.targetY = 5000;
    const seen = new Set<number>();
    let spawns = 0;
    for (let t = 0; t < 60 * 14 && spawns < 3; t++) {
      w.step(1 / 60);
      for (const m of ctl.minionsOf(me)) {
        const key = m.id * 1000 + Math.round(m.stats.spawnedAt * 60);
        if (!m.alive || seen.has(key)) continue;
        seen.add(key);
        spawns++;
        // measured on the tick it appeared
        const c = m.cells[0];
        const cell = me.cells[0];
        const gap = Math.hypot(c.x - cell.x, c.y - cell.y) - cell.radius - c.radius;
        expect(gap).toBeGreaterThan(30);
        expect(gap).toBeLessThan(PHYSICS.MINION_SPAWN_GAP_MAX + 150);
      }
    }
    expect(spawns).toBe(3);
  });

  it('feed key makes minions eject mass at their master', () => {
    const { w, ctl, me } = botsWorld();
    run(w, 1.1);
    const m = ctl.minionsOf(me)[0];
    w.setMass(m.cells[0], 300);
    // cursor far from the master: minions head there but still aim the feed at the master
    me.targetX = me.cells[0].x;
    me.targetY = me.cells[0].y - 3000;
    const before = me.cells[0].mass;
    me.minionEjecting = true;
    run(w, 1.5);
    me.minionEjecting = false;
    run(w, 1.5);
    expect(m.ejectAt).toBeNull();
    expect(m.ejecting).toBe(false);
    // the minion gave its mass away (or was eaten by the master it fed)
    expect(!m.alive || m.cells[0].mass < 150).toBe(true);
    expect(w.totalMass(me)).toBeGreaterThan(before + 100);
  });

  it('every AI player gets minions and uses them in a full match', () => {
    const w = new World({ mode: 'bots', seed: 7, mapSize: 6000, foodTarget: 800, virusMin: 15 });
    const bots = new BotController(w);
    const ctl = new MinionController(w);
    w.populate();
    bots.addBots(10);
    run(w, 1 + PHYSICS.MINION_SPAWN_INTERVAL * 3);
    const masters = w.players.filter((p) => !p.master);
    expect(masters).toHaveLength(10);
    for (const p of masters) expect(ctl.minionsOf(p).length).toBeGreaterThan(0);
    expect(w.players.filter((p) => p.master).length).toBeLessThanOrEqual(10 * PHYSICS.MINIONS_PER_PLAYER);
    run(w, 40);
    expect(w.leaderboard.every((e) => !w.players.find((p) => p.id === e.id)!.master)).toBe(true);
    expect(w.players.some((p) => p.master && p.stats.foodEaten > 10)).toBe(true);
  });
});
