import { expect, test, type Page } from '@playwright/test';
import {
  FOLK_VALLEY_CONFIG,
  formatSeed,
  initialPlayerState,
  seedFromText,
  spin,
  type SpinResult,
} from '../../src/engine/index';

/**
 * Browser tests for the app shell. They check state, not pixels: the DOM text, and the
 * scene's read-only snapshot on `window.__fv`. Every expected figure comes from calling the
 * engine here with the same seed, so the page has to show exactly what the engine decided.
 */

const CONFIG = FOLK_VALLEY_CONFIG;
const STARTING_BALANCE = 10_000;
const BET = CONFIG.bet.levels[0]!;
const COST = CONFIG.bet.coinsPerSpin * BET;

function firstSpin(seedText: string): { seed: string; result: SpinResult } {
  const seed = formatSeed(seedFromText(seedText));
  const { result } = spin(CONFIG, initialPlayerState(CONFIG), { masterSeed: seed, spinIndex: 0, betLevel: BET });
  return { seed, result };
}

/** The first text seed `prefix-N` whose first spin matches. */
function findSeed(prefix: string, wanted: (result: SpinResult) => boolean): { text: string; seed: string; result: SpinResult } {
  for (let n = 0; n < 100_000; n++) {
    const text = `${prefix}-${n}`;
    const { seed, result } = firstSpin(text);
    if (wanted(result)) return { text, seed, result };
  }
  throw new Error(`No seed ${prefix}-N matched.`);
}

async function useSeed(page: Page, text: string): Promise<void> {
  await page.getByTestId('seed').fill(text);
  await page.getByTestId('seed-apply').click();
}

/** Clicks Spin and waits until the whole result has been shown. */
async function spinAndWait(page: Page): Promise<void> {
  const before = await page.getByTestId('spin-number').textContent();
  await page.getByTestId('spin').click();
  await expect(page.getByTestId('spin-number')).not.toHaveText(before ?? '');
  await expect(page.getByTestId('total-win')).toBeVisible();
}

async function sceneSnapshot(page: Page) {
  return page.evaluate(() => window.__fv?.scene() ?? null);
}

test('the app loads with a full balance and a running scene', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Folk Valley' })).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE));
  await expect(page.locator('canvas.scene-canvas')).toBeVisible();
  await expect.poll(async () => (await sceneSnapshot(page))?.renderer).toBe('pixi');
  await expect(page.getByTestId('scar-card')).toHaveAttribute('data-marks', '0');
  await expect(page.getByTestId('gore-full')).toBeChecked();
});

test('a seeded spin shows the stops and the win the engine decided', async ({ page }) => {
  const text = 'e2e-seeded-spin';
  const { seed, result } = firstSpin(text);
  await page.goto('/');
  await useSeed(page, text);
  await expect(page.getByTestId('current-seed')).toHaveText(seed);
  await spinAndWait(page);

  const win = result.totalWinCoins * BET;
  await expect(page.getByTestId('stops')).toHaveText(result.base.stops.join(', '));
  await expect(page.getByTestId('total-win')).toHaveAttribute('data-credits', String(win));
  await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE - COST + win));

  const scene = await sceneSnapshot(page);
  expect(scene?.phase).toBe('shown');
  const lastFrame = result.session === null ? result.base.stops : result.session.spins.at(-1)?.stops;
  expect(scene?.frame?.stops).toEqual(lastFrame);
});

test('a winning spin lists every ways win and highlights it in the scene', async ({ page }) => {
  const found = findSeed('e2e-win', (r) => r.base.wins.length > 0 && r.session === null);
  await page.goto('/');
  await useSeed(page, found.text);
  await spinAndWait(page);

  await expect(page.getByTestId('wins').locator('li')).toHaveCount(found.result.base.wins.length);
  const scene = await sceneSnapshot(page);
  const expected = new Set(found.result.base.wins.flatMap((w) => w.positions.map((p) => `${p.reel},${p.row}`)));
  expect(new Set(scene?.frame?.highlights.map((p) => `${p.reel},${p.row}`))).toEqual(expected);
});

test('a landed trick turns the Kicker reel wild in the scene', async ({ page }) => {
  const found = findSeed('e2e-land', (r) => r.base.attempt?.outcome === 'landed' && r.session === null);
  await page.goto('/');
  await useSeed(page, found.text);
  await spinAndWait(page);

  const attempt = found.result.base.attempt!;
  await expect(page.getByTestId('trick')).toContainText('landed');
  const scene = await sceneSnapshot(page);
  expect(scene?.frame?.wildReels).toEqual(attempt.wildReels);
  expect(scene?.frame?.wildReels[0]).toBe(attempt.kicker.reel);
});

test('the Scar Card and the balance survive a reload', async ({ page }) => {
  const found = findSeed('e2e-bail', (r) => r.base.attempt?.outcome === 'bailed' && r.session === null);
  await page.goto('/');
  await useSeed(page, found.text);
  await spinAndWait(page);
  await expect(page.getByTestId('scar-card')).toHaveAttribute('data-marks', '1');
  const balance = String(STARTING_BALANCE - COST + found.result.totalWinCoins * BET);
  await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', balance);

  await page.reload();
  await expect(page.getByTestId('scar-card')).toHaveAttribute('data-marks', '1');
  await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', balance);
  await expect(page.getByTestId('spin-number')).toHaveText('2');

  // Each bet level has its own card.
  await page.getByTestId('bet').selectOption(String(CONFIG.bet.levels[1]));
  await expect(page.getByTestId('scar-card')).toHaveAttribute('data-marks', '0');
});

test('a Session shows every free spin with its multiplier, rung and pain', async ({ page }) => {
  const found = findSeed('e2e-session', (r) => r.session !== null && r.session.spins.length > 0);
  await page.goto('/');
  await useSeed(page, found.text);
  await spinAndWait(page);

  const items = page.getByTestId('session-spins').locator('li');
  await expect(items).toHaveCount(found.result.session!.spins.length);
  const first = found.result.session!.spins[0]!.ladderAfter;
  await expect(items.first()).toContainText(`Multiplier ×${first.multiplier}, rung ${first.rung}, pain ${first.pain} of 3`);
});

test('reset credits refills the balance', async ({ page }) => {
  await page.goto('/');
  await spinAndWait(page);
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE));
});

test('the gore setting persists across a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('gore-mild').check();
  await page.reload();
  await expect(page.getByTestId('gore-mild')).toBeChecked();
  await expect(page.getByTestId('gore-full')).not.toBeChecked();
});

test('Space and Enter spin from the keyboard, and focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Folk Valley' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('spin-number')).toHaveText('2');
  await expect(page.getByTestId('total-win')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('spin-number')).toHaveText('3');

  await page.getByTestId('spin').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const outline = await page.getByTestId('spin').evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});

test('the game plays with storage blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await spinAndWait(page);
  await expect(page.getByText('This browser is not saving progress')).toBeVisible();
});

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the reels stop one by one before the win is shown', async ({ page }) => {
    await page.goto('/');
    await expect.poll(async () => (await sceneSnapshot(page))?.renderer).toBe('pixi');
    await page.getByTestId('spin').click();
    await expect.poll(async () => (await sceneSnapshot(page))?.phase).toBe('stopping');
    await expect(page.getByTestId('total-win')).toBeVisible();
    const scene = await sceneSnapshot(page);
    expect(scene?.reelsStopped).toBe(5);
  });
});
