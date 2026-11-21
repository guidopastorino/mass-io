import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../../src/engine/constants';
import { emptyWorld, run } from './helpers';

describe('viruses (FFA)', () => {
  it('small cells pass over viruses without eating them', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'p' });
    const c = w.spawnPlayer(p, 100, { x: 3000, y: 3000 });
    w.createEntity('virus', 3000, 3000, PHYSICS.VIRUS_MASS, '#3d5');
    p.targetX = 3000; p.targetY = 3000;
    run(w, 0.5);
    expect(w.virusCount).toBe(1);
    expect(p.cells).toHaveLength(1);
    expect(c.mass).toBeLessThanOrEqual(100);
  });

  it('a big cell that eats a virus explodes into many pieces', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'p' });
    w.spawnPlayer(p, 1000, { x: 3000, y: 3000 });
    w.createEntity('virus', 3050, 3000, PHYSICS.VIRUS_MASS, '#3d5');
    p.targetX = 3050; p.targetY = 3000;
    w.step(1 / 60);
    expect(w.virusCount).toBe(0);
    expect(p.cells.length).toBe(PHYSICS.MAX_CELLS);
    const total = p.cells.reduce((s, c) => s + c.mass, 0);
    expect(total).toBeCloseTo(1100, -1);
    expect(p.stats.virusesEaten).toBe(1);
    run(w, 1);
    // pieces are flung outward
    const spread = Math.max(...p.cells.map((c) => Math.hypot(c.x - 3050, c.y - 3000)));
    expect(spread).toBeGreaterThan(300);
  });

  it('a cell already at 16 pieces just gains the virus mass', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'p' });
    const big = w.spawnPlayer(p, 1000, { x: 3000, y: 3000 });
    for (let i = 0; i < 15; i++) w.addCell(p, 6000 + i * 100, 6000, 40);
    w.createEntity('virus', 3000, 3000, PHYSICS.VIRUS_MASS, '#3d5');
    p.targetX = 3000; p.targetY = 3000;
    w.step(1 / 60);
    expect(p.cells).toHaveLength(16);
    expect(big.mass).toBeGreaterThan(1090);
  });

  it('feeding a virus 7 times shoots a new virus in the feed direction', () => {
    const w = emptyWorld();
    const v = w.createEntity('virus', 3000, 3000, PHYSICS.VIRUS_MASS, '#3d5');
    for (let shot = 0; shot < 7; shot++) {
      const blob = w.createEntity('eject', 2990, 3000, PHYSICS.EJECT_MASS, '#fff');
      w.setBoost(blob, 0, 100);
      w.step(1 / 60);
      expect(blob.removed).toBe(true);
      if (shot < 6) expect(v.mass).toBeCloseTo(PHYSICS.VIRUS_MASS + (shot + 1) * PHYSICS.EJECT_MASS, 3);
    }
    run(w, 2);
    expect(w.virusCount).toBe(2);
    expect(v.mass).toBe(PHYSICS.VIRUS_MASS);
    const shot = w.entities.find((e) => e.kind === 'virus' && e !== v)!;
    expect(shot.x).toBeGreaterThan(v.x + 600);
    expect(Math.abs(shot.y - v.y)).toBeLessThan(1);
  });

  it('ejected blobs fired by a player reach and feed a virus', () => {
    const w = emptyWorld();
    const p = w.addPlayer({ name: 'p' });
    w.spawnPlayer(p, 200, { x: 2000, y: 3000 });
    const v = w.createEntity('virus', 2260, 3000, PHYSICS.VIRUS_MASS, '#3d5');
    p.targetX = 2260; p.targetY = 3000;
    p.ejecting = true;
    w.step(1 / 60);
    p.ejecting = false;
    p.targetX = 1000;
    run(w, 1);
    expect(v.feed).toBe(1);
    expect(w.entities.some((e) => e.kind === 'eject')).toBe(false);
  });

  it('virus count is replenished to the minimum', () => {
    const w = emptyWorld();
    (w as unknown as { virusMin: number }).virusMin = 5;
    run(w, 4);
    expect(w.virusCount).toBe(5);
  });
});

describe('experimental mode', () => {
  it('fed viruses move instead of multiplying', () => {
    const w = emptyWorld('experimental');
    const v = w.createEntity('virus', 3000, 3000, PHYSICS.VIRUS_MASS, '#3d5');
    for (let shot = 0; shot < 8; shot++) {
      const blob = w.createEntity('eject', v.x - 10, v.y, PHYSICS.EJECT_MASS, '#fff');
      w.setBoost(blob, 0, 100);
      w.step(1 / 60);
      run(w, 0.2);
    }
    run(w, 2);
    expect(w.virusCount).toBe(1);
    expect(v.mass).toBe(PHYSICS.VIRUS_MASS);
    expect(v.x).toBeGreaterThan(3600);
    expect(Math.abs(v.y - 3000)).toBeLessThan(1);
  });

  it('spawners exist only in experimental and keep producing pellets', () => {
    const ffa = emptyWorld('ffa');
    expect(ffa.spawnerTarget).toBe(0);
    const w = emptyWorld('experimental');
    const s = w.createEntity('spawner', 5000, 5000, PHYSICS.SPAWNER_MASS, '#c66');
    run(w, 4);
    expect(w.foodCount).toBeGreaterThanOrEqual(5);
    expect(s.mass).toBe(PHYSICS.SPAWNER_MASS);
  });

  it('spawners absorb ejected mass and redistribute it as pellets', () => {
    const w = emptyWorld('experimental');
    const s = w.createEntity('spawner', 5000, 5000, PHYSICS.SPAWNER_MASS, '#c66');
    const blob = w.createEntity('eject', 5000, 5000, 13, '#fff');
    w.step(1 / 60);
    expect(blob.removed).toBe(true);
    expect(s.mass).toBeGreaterThan(PHYSICS.SPAWNER_MASS);
    run(w, 2);
    expect(s.mass).toBeCloseTo(PHYSICS.SPAWNER_MASS, 5);
    const pelletMass = w.entities.filter((e) => e.kind === 'food').reduce((a, e) => a + e.mass, 0);
    expect(pelletMass).toBeGreaterThanOrEqual(13);
  });

  it('spawners eat small player cells and can be eaten by big ones', () => {
    const w = emptyWorld('experimental');
    const small = w.addPlayer({ name: 'small' });
    const big = w.addPlayer({ name: 'big' });
    w.createEntity('spawner', 5000, 5000, PHYSICS.SPAWNER_MASS, '#c66');
    w.spawnPlayer(small, 50, { x: 5000, y: 5000 });
    small.targetX = 5000; small.targetY = 5000;
    w.step(1 / 60);
    expect(small.alive).toBe(false);
    expect(small.killedBy).toBe('Spawner');
    const s2 = w.createEntity('spawner', 2000, 2000, PHYSICS.SPAWNER_MASS, '#c66');
    const bc = w.spawnPlayer(big, 1000, { x: 2000, y: 2000 });
    big.targetX = 2000; big.targetY = 2000;
    w.step(1 / 60);
    expect(s2.removed).toBe(true);
    expect(bc.mass).toBeGreaterThan(1200);
  });
});
