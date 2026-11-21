import { describe, expect, it } from 'vitest';
import { BotController, decide } from '../../src/engine/bots';
import { PHYSICS } from '../../src/engine/constants';
import { World } from '../../src/engine/world';
import { emptyWorld, run } from './helpers';

function botWorld() {
  const w = emptyWorld();
  const ctl = new BotController(w);
  const bot = w.addPlayer({ name: 'bot', isBot: true });
  const brain = ctl.brainFor(bot);
  brain.aggression = 1;
  brain.caution = 1;
  return { w, ctl, bot, brain };
}

describe('bot decisions', () => {
  it('goes for nearby food', () => {
    const { w, bot, brain } = botWorld();
    w.spawnPlayer(bot, 20, { x: 5000, y: 5000 });
    w.spawnFood(5200, 5000, 2);
    w.spawnFood(5250, 5050, 2);
    w.rebuildGrid();
    const d = decide(w, bot, brain);
    expect(d.targetX).toBeGreaterThan(5000);
    expect(d.intent).toBe('feed');
  });

  it('flees from a bigger cell', () => {
    const { w, bot, brain } = botWorld();
    const enemy = w.addPlayer({ name: 'enemy' });
    w.spawnPlayer(bot, 50, { x: 5000, y: 5000 });
    w.spawnPlayer(enemy, 400, { x: 5400, y: 5000 });
    w.spawnFood(5150, 5000, 4);
    w.rebuildGrid();
    const d = decide(w, bot, brain);
    expect(d.intent).toBe('flee');
    expect(d.targetX).toBeLessThan(5000);
  });

  it('split-kills reachable prey when it is safe', () => {
    const { w, bot, brain } = botWorld();
    const prey = w.addPlayer({ name: 'prey' });
    w.spawnPlayer(bot, 400, { x: 5000, y: 5000 });
    w.spawnPlayer(prey, 100, { x: 5550, y: 5000 });
    w.rebuildGrid();
    const d = decide(w, bot, brain);
    expect(d.split).toBe(true);
    expect(d.intent).toBe('split-kill');
    expect(d.targetX).toBeGreaterThan(5400);
  });

  it('does not split when a third cell could eat the halves', () => {
    const { w, bot, brain } = botWorld();
    const prey = w.addPlayer({ name: 'prey' });
    const shark = w.addPlayer({ name: 'shark' });
    w.spawnPlayer(bot, 400, { x: 5000, y: 5000 });
    w.spawnPlayer(prey, 100, { x: 5550, y: 5000 });
    w.spawnPlayer(shark, 380, { x: 5000, y: 6100 });
    w.rebuildGrid();
    expect(decide(w, bot, brain).split).toBe(false);
  });

  it('does not split into a virus on the way', () => {
    const { w, bot, brain } = botWorld();
    const prey = w.addPlayer({ name: 'prey' });
    w.spawnPlayer(bot, 600, { x: 5000, y: 5000 });
    w.spawnPlayer(prey, 120, { x: 5700, y: 5000 });
    w.createEntity('virus', 5420, 5000, PHYSICS.VIRUS_MASS, '#3d5');
    w.rebuildGrid();
    expect(decide(w, bot, brain).split).toBe(false);
  });

  it('steers away from viruses when big enough to pop', () => {
    const { w, bot, brain } = botWorld();
    w.spawnPlayer(bot, 600, { x: 5000, y: 5000 });
    w.createEntity('virus', 5000 + 245 + 100 + 40, 5000, PHYSICS.VIRUS_MASS, '#3d5');
    w.rebuildGrid();
    expect(decide(w, bot, brain).targetX).toBeLessThan(5000);
  });

  it('shoots a virus at a big threat lined up behind it', () => {
    const { w, bot, brain } = botWorld();
    const giant = w.addPlayer({ name: 'giant' });
    w.spawnPlayer(bot, 500, { x: 5000, y: 5000 });
    w.createEntity('virus', 5450, 5000, PHYSICS.VIRUS_MASS, '#3d5');
    w.spawnPlayer(giant, 3000, { x: 6300, y: 5000 });
    w.rebuildGrid();
    const d = decide(w, bot, brain);
    expect(d.intent).toBe('shoot-virus');
    expect(d.eject).toBe(true);
    expect(d.targetX).toBe(5450);
  });

  it('avoids the map border', () => {
    const { w, bot, brain } = botWorld();
    w.spawnPlayer(bot, 30, { x: 60, y: 5000 });
    w.rebuildGrid();
    expect(decide(w, bot, brain).targetX).toBeGreaterThan(60);
  });
});

describe('bot controller', () => {
  it('respawns dead bots', () => {
    const { w, bot } = botWorld();
    w.spawnPlayer(bot, 20, { x: 5000, y: 5000 });
    const killer = w.addPlayer({ name: 'k' });
    w.spawnPlayer(killer, 500, { x: 5000, y: 5000 });
    killer.targetX = 5000; killer.targetY = 5000;
    w.step(1 / 60);
    expect(bot.alive).toBe(false);
    killer.cells.forEach((c) => (c.x = 100));
    run(w, 6);
    expect(bot.alive).toBe(true);
  });

  it('a populated world plays out: bots eat, grow, die, respawn and rank', () => {
    const w = new World({ mode: 'ffa', seed: 42, mapSize: 6000, foodTarget: 800, virusMin: 15 });
    const ctl = new BotController(w);
    w.populate();
    ctl.addBots(25);
    const deaths: number[] = [];
    for (let t = 0; t < 60 * 60; t++) {
      w.step(1 / 60);
      for (const e of w.drainEvents()) if (e.type === 'death') deaths.push(e.playerId);
    }
    expect(w.leaderboard.length).toBe(10);
    expect(w.leaderboard[0].mass).toBeGreaterThan(300);
    expect(w.players.some((p) => p.stats.foodEaten > 50)).toBe(true);
    expect(deaths.length).toBeGreaterThan(0);
    expect(w.players.filter((p) => p.alive).length).toBeGreaterThan(15);
    const intents = new Set([...ctl.brains.values()].map((b) => b.intent));
    expect(intents.size).toBeGreaterThan(1);
  });
});
