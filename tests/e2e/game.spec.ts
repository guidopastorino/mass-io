import { expect, test, type Page } from '@playwright/test';

/** Runs code against the live Game instance exposed on window for debugging/tests. */
const game = <T>(page: Page, fn: string) => page.evaluate(`(() => { const g = window.__massio; ${fn} })()`) as Promise<T>;

async function play(page: Page, nick = 'E2E') {
  await page.goto('/');
  await page.getByTestId('nickname').fill(nick);
  await page.getByTestId('play').click();
  await expect(page.getByTestId('menu')).toBeHidden();
  await expect(page.getByTestId('score')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('menu shows modes, skins and starts a FFA game', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('menu')).toBeVisible();
  await expect(page.getByTestId('mode-ffa')).toHaveAttribute('aria-checked', 'true');
  for (const s of ['none', 'earth', 'moon', 'mars', 'sun', 'jupiter', 'neptune', 'lava', 'galaxy']) {
    await expect(page.getByTestId(`skin-${s}`)).toBeVisible();
  }
  // every skin preview is actually painted (non-empty data URL)
  const urls = await page.locator('.skin[data-testid^=skin-]:not([data-testid=skin-none])').evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).backgroundImage.length),
  );
  expect(urls).toHaveLength(8);
  for (const len of urls) expect(len).toBeGreaterThan(1000);
  await page.getByTestId('skin-galaxy').click();
  await expect(page.getByTestId('skin-galaxy')).toHaveClass(/active/);
  await page.getByTestId('skin-moon').click();
  await play(page, 'Moonie');
  // the human starts every life with 1000 mass (± decay / a pellet eaten on spawn)
  const startMass = await game<number>(page, 'return g.world.totalMass(g.me);');
  expect(startMass).toBeGreaterThan(980);
  expect(startMass).toBeLessThan(1030);
  const me = await game<{ name: string; skin: string; alive: boolean; mode: string }>(
    page,
    'return { name: g.me.name, skin: g.me.skin, alive: g.me.alive, mode: g.world.mode };',
  );
  expect(me).toEqual({ name: 'Moonie', skin: 'moon', alive: true, mode: 'ffa' });
  await expect(page.getByTestId('leaderboard')).toContainText('Leaderboard');
});

test('the player follows the mouse cursor', async ({ page }) => {
  await play(page);
  const start = await game<{ x: number; y: number }>(page, 'return { x: g.me.cells[0].x, y: g.me.cells[0].y };');
  await page.mouse.move(1200, 360);
  await page.waitForTimeout(1200);
  const end = await game<{ x: number; y: number }>(page, 'return { x: g.me.cells[0].x, y: g.me.cells[0].y };');
  expect(end.x - start.x).toBeGreaterThan(200);
});

test('space splits, W ejects, and the camera keeps all cells on screen', async ({ page }) => {
  // No bots, so nothing can eat the split pieces during the test.
  await page.evaluate(() => localStorage.setItem('mass-io:settings', JSON.stringify({ botCount: 0 })));
  await play(page);
  await game(page, 'g.world.setMass(g.me.cells[0], 800);');
  await page.mouse.move(1100, 300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  // 4 from two splits (more only if a piece popped on a virus).
  expect(await game<number>(page, 'return g.me.cells.length;')).toBeGreaterThanOrEqual(4);
  const allVisible = await game<boolean>(
    page,
    `const W = g.canvas.clientWidth, H = g.canvas.clientHeight;
     return g.me.cells.every((c) => { const s = g.camera.worldToScreen(c.x, c.y, W, H);
       return s.x > 0 && s.x < W && s.y > 0 && s.y < H; });`,
  );
  expect(allVisible).toBe(true);
  const before = await game<number>(page, 'return g.world.totalMass(g.me);');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  const after = await game<number>(page, 'return g.world.totalMass(g.me);');
  expect(before - after).toBeGreaterThan(60);
});

test('rebound keys work in game and settings persist across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await page.getByTestId('theme').selectOption('dark');
  await page.getByTestId('tab-controls').click();
  await page.getByTestId('bind-split').click();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('bind-split')).toHaveText('Q');
  await page.getByTestId('tab-hud').click();
  await page.getByTestId('hud-fps').uncheck();
  await page.getByTestId('close-settings').click();
  // No bots, so nothing interferes with the split count below.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('mass-io:settings')!);
    localStorage.setItem('mass-io:settings', JSON.stringify({ ...s, botCount: 0 }));
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await play(page);
  await expect(page.getByTestId('fps')).toBeHidden();
  await expect(page.getByTestId('ping')).toBeVisible();
  // 120 mass: enough to split, too small to pop on a virus.
  await game(page, 'g.world.setMass(g.me.cells[0], 120);');
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  expect(await game<number>(page, 'return g.me.cells.length;')).toBe(1);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(200);
  expect(await game<number>(page, 'return g.me.cells.length;')).toBe(2);
});

test('HUD toggles hide the leaderboard and score', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await page.getByTestId('tab-hud').click();
  await page.getByTestId('hud-leaderboard').uncheck();
  await page.getByTestId('hud-mass').uncheck();
  await page.getByTestId('hud-stats').check();
  await page.getByTestId('close-settings').click();
  await page.getByTestId('play').click();
  await expect(page.getByTestId('live-stats')).toBeVisible();
  await expect(page.getByTestId('leaderboard')).toBeHidden();
  await expect(page.getByTestId('score')).toBeHidden();
});

test('escape opens the menu and continue resumes', async ({ page }) => {
  await play(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('menu')).toBeVisible();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('menu')).toBeHidden();
  expect(await game<boolean>(page, 'return g.me.alive;')).toBe(true);
});

test('death screen shows stats and play again respawns', async ({ page }) => {
  await play(page, 'Victim');
  await game(
    page,
    `const bot = g.world.players.find((p) => p.isBot && p.alive);
     const c = bot.cells[0]; g.world.setMass(c, 3000);
     c.x = g.me.cells[0].x; c.y = g.me.cells[0].y; bot.targetX = c.x; bot.targetY = c.y;`,
  );
  await expect(page.getByTestId('death')).toBeVisible();
  await expect(page.getByTestId('death')).toContainText('Masa máxima');
  await expect(page.getByTestId('death')).toContainText('Tiempo vivo');
  await page.getByTestId('play-again').click();
  await expect(page.getByTestId('death')).toBeHidden();
  expect(await game<boolean>(page, 'return g.me.alive;')).toBe(true);
});

test('experimental mode has spawners and bots on the leaderboard', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-experimental').click();
  await play(page);
  const info = await game<{ mode: string; spawners: number; bots: number }>(
    page,
    `return { mode: g.world.mode, spawners: g.world.spawnerCount, bots: g.world.players.filter((p) => p.isBot).length };`,
  );
  expect(info.mode).toBe('experimental');
  expect(info.spawners).toBeGreaterThan(0);
  expect(info.bots).toBe(40);
  await expect(page.locator('[data-testid=leaderboard] li')).toHaveCount(10);
});

test('bots play autonomously over time', async ({ page }) => {
  await page.goto('/');
  const before = await game<number>(page, 'return g.world.players.reduce((s, p) => s + p.stats.foodEaten, 0);');
  await page.waitForTimeout(2000);
  const after = await game<number>(page, 'return g.world.players.reduce((s, p) => s + p.stats.foodEaten, 0);');
  expect(after).toBeGreaterThan(before + 20);
});
