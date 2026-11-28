import { expect, test, type Page } from '@playwright/test';
import {
  FOLK_VALLEY_CONFIG,
  formatSeed,
  initialPlayerState,
  seedFromText,
  spin,
  type PlayerState,
  type SpinResult,
} from '../../src/engine/index';
import { formatPercent } from '../../src/ui/stats/format';

/**
 * Browser tests for the statistics panel: the theoretical figures come from the analysis
 * worker, the observed ones from the player's own seeded spins, and a simulation runs in the
 * simulation workers to completion and through a cancel. Expected observed figures are
 * computed here by calling the engine with the same seed.
 */

const CONFIG = FOLK_VALLEY_CONFIG;
const BET = CONFIG.bet.levels[0]!;

function seededSpins(text: string, count: number): SpinResult[] {
  const masterSeed = formatSeed(seedFromText(text));
  let state: PlayerState = initialPlayerState(CONFIG);
  const out: SpinResult[] = [];
  for (let i = 0; i < count; i++) {
    const outcome = spin(CONFIG, state, { masterSeed, spinIndex: i, betLevel: BET });
    state = outcome.state;
    out.push(outcome.result);
  }
  return out;
}

async function openPanel(page: Page): Promise<void> {
  const toggle = page.getByTestId('stats-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test('the panel shows the theoretical RTP and the player’s observed spins', async ({ page }) => {
  const text = 'e2e-stats-panel';
  const spins = seededSpins(text, 3);
  await page.goto('/');
  await page.getByTestId('seed').fill(text);
  await page.getByTestId('seed-apply').click();

  await openPanel(page);
  const theoretical = page.getByTestId('stats-theoretical');
  await expect(theoretical.getByRole('heading', { name: /^Theoretical:/ })).toBeVisible();
  // Precomputed, so it is there as soon as the panel opens.
  await expect(page.getByTestId('theoretical-rtp')).toContainText('95.997%');
  await expect(page.getByTestId('theoretical-split-sessionFromScarCard')).toContainText('points');
  await expect(page.getByTestId('theoretical-max-win')).toContainText('not a realistic outcome');
  await expect(page.getByTestId('observed-empty')).toBeVisible();

  for (let i = 1; i <= spins.length; i++) {
    await page.getByTestId('spin').click();
    await expect(page.getByTestId('observed-sample-spins')).toContainText(String(i));
  }
  const won = spins.reduce((a, r) => a + r.totalWinCoins, 0);
  const bet = spins.reduce((a, r) => a + r.costCoins, 0);
  await expect(page.getByTestId('observed-rtp')).toContainText(formatPercent(won / bet, 2).text);
  await expect(page.getByTestId('observed-sample-bet')).toContainText(`${(bet * BET).toLocaleString('en-US')} credits`);
  await expect(page.getByTestId('observed-swing')).toContainText('Only 3 spins');
  await expect(page.getByTestId('observed-z')).toContainText('the theoretical RTP');

  // Closing the panel keeps the session; it is still there when it opens again.
  await page.getByTestId('stats-toggle').click();
  await expect(page.getByTestId('stats-observed')).toBeHidden();
  await page.getByTestId('stats-toggle').click();
  await expect(page.getByTestId('observed-sample-spins')).toContainText('3');
});

test('a simulation runs to completion in workers, and a long one can be cancelled', async ({ page }) => {
  await page.goto('/');
  await openPanel(page);
  await expect(page.getByTestId('theoretical-rtp')).toContainText('95.997%');

  await page.getByTestId('sim-size-10000').check();
  await page.getByTestId('sim-start').click();
  await expect(page.getByTestId('sim-status')).toHaveText('Simulation finished: 10,000 spins.', { timeout: 20_000 });
  await expect(page.getByTestId('sim-meta')).toContainText('10,000 simulated paid spins');
  await expect(page.getByTestId('sim-compare-rtp')).toContainText('96.00%');
  await expect(page.getByTestId('sim-compare-rtp')).toContainText(/[+−]\d\.\d\d/);
  await expect(page.getByTestId('stats-simulate').getByRole('heading', { name: /^Simulate:/ })).toBeVisible();
  await expect(page.getByTestId('sim-results').getByRole('heading', { name: 'Simulated results' })).toBeVisible();

  // A long run, cancelled as soon as it shows progress: it never has to finish, even on a 2-core runner.
  await page.getByTestId('sim-size-1000000').check();
  await page.getByTestId('sim-start').click();
  await expect(page.getByTestId('sim-progress')).toHaveAttribute('value', /^[1-9]\d*$/, { timeout: 15_000 });
  await page.getByTestId('sim-cancel').click();
  await expect(page.getByTestId('sim-status')).toContainText('Simulation cancelled after', { timeout: 15_000 });
  await expect(page.getByTestId('sim-status')).toContainText('of 1,000,000 spins');
  await expect(page.getByTestId('sim-start')).toBeEnabled();
});
