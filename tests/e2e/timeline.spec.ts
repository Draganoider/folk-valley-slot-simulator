import { expect, test, type Page } from '@playwright/test';
import { FOLK_VALLEY_CONFIG, formatSeed, initialPlayerState, seedFromText, spin, type SpinResult } from '../../src/engine/index';
import {
  buildTimeline,
  DEFAULT_TIMINGS,
  type Timeline,
  type TimelineEvent,
  type TimelineEventKind,
  type TimelineOptions,
} from '../../src/presentation/index';

/**
 * The scene playing each spin through its presentation timeline. `page.clock` replaces the
 * page's `performance.now()` and `requestAnimationFrame`, so the test steps presentation
 * time exactly and checks what the scene shows at chosen moments. Expected times come from
 * building the same timeline here, from the same seeded result.
 *
 * The seeds were found by searching first paid spins with the engine
 * (`.scratch/timeline-scene/find-seeds.ts`); `tests/renderer/view.test.ts` checks that they
 * still give these spins.
 */

const CONFIG = FOLK_VALLEY_CONFIG;
const STARTING_BALANCE = 10_000;
const BET = CONFIG.bet.levels[0]!;
const COST = CONFIG.bet.coinsPerSpin * BET;

const SEEDS = {
  landed: 'fv-land-45',
  bailed: 'fv-bail-5',
  session: 'fv-session-532',
  broken: 'fv-broken-14',
} as const;

const START = new Date('2026-11-27T12:00:00Z').getTime();

function firstSpin(text: string): SpinResult {
  return spin(CONFIG, initialPlayerState(CONFIG), { masterSeed: formatSeed(seedFromText(text)), spinIndex: 0, betLevel: BET }).result;
}

function event<K extends TimelineEventKind>(timeline: Timeline, kind: K, nth = 0): Extract<TimelineEvent, { kind: K }> {
  const found = timeline.events.filter((e) => e.kind === kind)[nth];
  if (found === undefined) throw new Error(`no ${kind} #${nth}`);
  return found as Extract<TimelineEvent, { kind: K }>;
}

const mid = (e: TimelineEvent): number => e.start + Math.floor(e.duration / 2);

async function snapshot(page: Page) {
  const snap = await page.evaluate(() => window.__fv?.scene() ?? null);
  if (snap === null) throw new Error('no scene hook');
  return snap;
}

interface Run {
  readonly result: SpinResult;
  readonly timeline: Timeline;
  /** Steps the page clock until presentation time reaches about `t`, and returns the snapshot. */
  to(t: number): ReturnType<typeof snapshot>;
}

/**
 * Opens the page on a paused fake clock, applies the seed and the options, clicks Spin and
 * returns a way to step presentation time.
 */
async function startSpin(page: Page, text: string, options: { gore?: 'full' | 'mild'; turbo?: boolean; reduced?: boolean } = {}): Promise<Run> {
  const result = firstSpin(text);
  const timelineOptions: TimelineOptions = { gore: options.gore ?? 'full', reducedMotion: options.reduced ?? false, turbo: false };
  const timeline = buildTimeline(result, timelineOptions);
  const speed = options.turbo === true ? DEFAULT_TIMINGS.turboFactor : 1;

  await page.clock.install({ time: START });
  await page.goto('/');
  await expect.poll(async () => (await snapshot(page)).renderer).toBe('pixi');
  if (options.gore === 'mild') await page.getByTestId('gore-mild').check();
  if (options.turbo === true) await page.getByTestId('turbo').check();
  await page.getByTestId('seed').fill(text);
  await page.getByTestId('seed-apply').click();
  await page.clock.pauseAt(START + 60_000);
  await page.getByTestId('spin').click();

  let clockElapsed = 0;
  return {
    result,
    timeline,
    async to(t: number) {
      const wanted = Math.ceil(t / speed);
      if (wanted > clockElapsed) {
        await page.clock.runFor(wanted - clockElapsed);
        clockElapsed = wanted;
      }
      const snap = await snapshot(page);
      // One animation frame of slack: the last frame fired at or before the wanted time.
      expect(snap.view?.time ?? -1).toBeGreaterThanOrEqual(Math.min(timeline.duration, t) - 17 * speed);
      return snap;
    },
  };
}

test.describe('with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a landed trick plays its approach, jump and landing, turns the Kicker reel wild and pays', async ({ page }) => {
    const run = await startSpin(page, SEEDS.landed);
    const attempt = run.result.base.attempt!;
    const timeline = run.timeline;
    const win = run.result.totalWinCoins * BET;

    // Input is locked while the timeline plays; skip and turbo stay available.
    await expect(page.getByTestId('spin')).toBeDisabled();
    await expect(page.getByTestId('bet')).toBeDisabled();
    await expect(page.getByTestId('seed')).toBeDisabled();
    await expect(page.getByTestId('gore-mild')).toBeDisabled();
    await expect(page.getByTestId('skip')).toBeEnabled();
    await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE - COST));

    let snap = await run.to(event(timeline, 'reel-stop', 2).start + 20);
    expect(snap.phase).toBe('playing');
    expect(snap.reelsStopped).toBe(3);

    snap = await run.to(mid(event(timeline, 'trick-approach')));
    expect(snap.view?.rider?.pose).toBe('approach');
    expect(snap.view?.kicker).toEqual(attempt.kicker);

    snap = await run.to(mid(event(timeline, 'trick')));
    expect(snap.view?.rider?.pose).toBe('air');
    expect(snap.view?.rider?.clip.id).toBe(attempt.trickId);

    snap = await run.to(mid(event(timeline, 'trick-land')));
    expect(snap.view?.rider?.label).toBe('LANDED!');

    const wild = event(timeline, 'wild-reels');
    snap = await run.to(wild.start + wild.duration + 20);
    expect(snap.view?.wildReels).toEqual(attempt.wildReels);

    const highlight = event(timeline, 'win-highlight');
    snap = await run.to(mid(highlight));
    expect(snap.view?.highlights).toEqual(highlight.positions);
    expect(snap.view?.winLabel).toContain(String(highlight.coins * BET));

    // The count-up runs on the scene; the balance takes the win only once it has finished.
    snap = await run.to(mid(event(timeline, 'count-up')));
    expect(snap.view?.countingUp).toBe(true);
    expect(snap.view?.winCredits).toBeLessThan(win);
    await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE - COST));

    snap = await run.to(timeline.duration + 20);
    expect(snap.phase).toBe('shown');
    expect(snap.view?.winCredits).toBe(win);
    await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE - COST + win));
    await expect(page.getByTestId('total-win')).toHaveAttribute('data-credits', String(win));
    await expect(page.getByTestId('spin')).toBeEnabled();
  });

  test('a bail cuts away on contact, shows the scuffed card, the patch-up and the Scar Card mark', async ({ page }) => {
    const run = await startSpin(page, SEEDS.bailed);
    const timeline = run.timeline;
    const impact = event(timeline, 'bail-impact');

    let snap = await run.to(impact.start + Math.floor(impact.duration * 0.2));
    expect(snap.view?.rider?.pose).toBe('falling');
    snap = await run.to(impact.start + Math.floor(impact.duration * 0.6));
    expect(snap.view?.rider).toBeNull();
    expect(snap.view?.flash).toBeGreaterThan(0);

    snap = await run.to(mid(event(timeline, 'injury')));
    expect(snap.view?.card?.title).toBe('SCUFFED');
    snap = await run.to(mid(event(timeline, 'patch-up')));
    expect(snap.view?.card?.title).toBe('PATCHED UP');
    snap = await run.to(mid(event(timeline, 'scar-card')));
    expect(snap.view?.scarCard).toMatchObject({ marks: 1, change: 'mark' });

    snap = await run.to(timeline.duration + 20);
    expect(snap.cardsSeen).toEqual(['injury:scuffed', 'patch-up:patched-up', 'spin-win', 'scar-card']);
    const win = run.result.totalWinCoins * BET;
    await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE - COST + win));
    await expect(page.getByTestId('scar-card')).toHaveAttribute('data-marks', '1');
  });

  test('a Session plays its intro, free spins, ladder, pain, the closing card filmed by a friend and the total', async ({ page }) => {
    test.setTimeout(120_000);
    const run = await startSpin(page, SEEDS.session);
    const timeline = run.timeline;
    const session = run.result.session!;

    let snap = await run.to(mid(event(timeline, 'session-trigger')));
    expect(snap.view?.card?.title).toBe('SESSION!');
    snap = await run.to(mid(event(timeline, 'session-intro')));
    expect(snap.view?.card?.lines).toContain(`${session.startingSpins} free spins`);
    // The free spin, the first climb and the first pain, in the order they play.
    const free = event(timeline, 'free-spin', 1);
    const climb = event(timeline, 'ladder-climb');
    const pain = event(timeline, 'pain');
    const checks: [TimelineEvent, () => Promise<void>][] = [
      [
        free,
        async () => {
          expect(snap.view?.card?.title).toBe('FREE SPIN 2');
          // The caption follows the reels, which still show free spin 1 until the next spin-up.
          expect(snap.view?.caption).toBe('Free spin 1');
        },
      ],
      [
        climb,
        async () => {
          expect(snap.view?.card?.title).toMatch(/CLIMB|TOP RUNG/);
          expect(snap.view?.session?.ladder).toEqual(climb.to);
        },
      ],
      [
        pain,
        async () => {
          expect(snap.view?.card?.title).toBe('PAIN');
          expect(snap.view?.session?.ladder.pain).toBe(pain.to.pain);
          expect(snap.view?.session?.spinsLeft).toBe(pain.spinsLeftAfter);
        },
      ],
    ];
    checks.sort((a, b) => a[0].start - b[0].start);
    for (const [e, check] of checks) {
      snap = await run.to(mid(e));
      await check();
    }

    snap = await run.to(mid(event(timeline, 'closing-card')));
    expect(snap.view?.card?.friendFilming).toBe(true);
    expect(snap.view?.card?.level).toBe('patched-up');
    snap = await run.to(mid(event(timeline, 'session-total')));
    expect(snap.view?.card?.title).toBe('SESSION TOTAL');

    snap = await run.to(timeline.duration + 20);
    expect(snap.phase).toBe('shown');
    const win = run.result.totalWinCoins * BET;
    await expect(page.getByTestId('session-spins').locator('li')).toHaveCount(session.spins.length);
    await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE - COST + win));
  });

  test('skip seeks to the end and still shows the final state', async ({ page }) => {
    const run = await startSpin(page, SEEDS.session);
    let snap = await run.to(1_000);
    expect(snap.phase).toBe('playing');
    await page.getByTestId('skip').click();
    snap = await snapshot(page);
    expect(snap.phase).toBe('shown');
    expect(snap.view?.time).toBe(run.timeline.duration);
    expect(snap.view?.stops).toEqual(run.result.session!.spins.at(-1)!.stops);
    expect(snap.view?.scarCard.marks).toBe(run.timeline.final.scarCardMarks);
    const win = run.result.totalWinCoins * BET;
    expect(snap.view?.winCredits).toBe(win);
    await expect(page.getByTestId('total-win')).toHaveAttribute('data-credits', String(win));
    await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE - COST + win));
    await expect(page.getByTestId('skip')).toBeDisabled();
    await expect(page.getByTestId('spin')).toBeEnabled();
  });

  test('turbo plays the same timeline 2.5 times as fast', async ({ page }) => {
    const run = await startSpin(page, SEEDS.landed, { turbo: true });
    const timeline = run.timeline;
    await page.clock.runFor(Math.ceil(timeline.duration / 2 / DEFAULT_TIMINGS.turboFactor));
    let snap = await snapshot(page);
    expect(snap.view?.time).toBeGreaterThan(timeline.duration / 2 - 50);
    expect(snap.view?.time).toBeLessThanOrEqual(timeline.duration / 2 + 1);
    snap = await run.to(timeline.duration + 20);
    expect(snap.phase).toBe('shown');
    const win = run.result.totalWinCoins * BET;
    await expect(page.getByTestId('balance')).toHaveAttribute('data-credits', String(STARTING_BALANCE - COST + win));
  });

  test('gore Mild never shows the broken card, and shows the patch-up in its place', async ({ page }) => {
    test.setTimeout(120_000);
    const run = await startSpin(page, SEEDS.broken, { gore: 'mild', turbo: true });
    const replaced = run.timeline.events.find((e) => e.kind === 'patch-up' && e.replaces?.level === 'broken')!;
    let snap = await run.to(mid(replaced));
    expect(snap.view?.card?.title).toBe('PATCHED UP');
    expect(snap.view?.card?.bloodHidden).toBe(true);
    snap = await run.to(run.timeline.duration + 20);
    expect(snap.phase).toBe('shown');
    expect(snap.cardsSeen).not.toContain('injury:broken');
    expect(snap.cardsSeen).toContain('patch-up:patched-up');
  });

  test('gore Full does show the broken card for the same spin', async ({ page }) => {
    test.setTimeout(120_000);
    const run = await startSpin(page, SEEDS.broken, { turbo: true });
    const broken = run.timeline.events.find((e) => e.kind === 'injury' && e.level === 'broken')!;
    const snap = await run.to(mid(broken));
    expect(snap.view?.card?.title).toBe('BROKEN');
    expect(snap.cardsSeen).toContain('injury:broken');
  });
});

test('under reduced motion the shortened timeline plays, without a flash', async ({ page }) => {
  const run = await startSpin(page, SEEDS.bailed, { reduced: true });
  const impact = event(run.timeline, 'bail-impact');
  let snap = await run.to(mid(impact));
  expect(snap.view?.reduced).toBe(true);
  expect(snap.view?.flash).toBe(0);
  expect(snap.view?.duration).toBe(run.timeline.duration);
  expect(run.timeline.duration).toBeLessThan(buildTimeline(run.result, { gore: 'full', reducedMotion: false, turbo: false }).duration);
  snap = await run.to(run.timeline.duration + 20);
  expect(snap.phase).toBe('shown');
});
