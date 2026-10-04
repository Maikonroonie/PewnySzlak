import { test, expect } from '@playwright/test';

const filmUrl = process.env.LAUNCH_URL || 'http://127.0.0.1:8090/';

test('launch film renders all five chapters, scrubs and supports recording controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(filmUrl);
  expect(errors).toEqual([]);
  const seek = async (seconds: number) => page.evaluate(t => (window as any).launchFilm.seek(t), seconds);
  await expect(page.getByRole('button', { name: 'Play film', exact: true })).toBeVisible();
  await seek(4);
  await expect(page.locator('#copy-onboarding')).toHaveCSS('opacity', '1');
  await seek(14);
  await expect(page.locator('#bicycle-mode')).toHaveClass('mode selected');
  await expect(page.locator('#ride-pill')).toHaveCSS('opacity', '1');
  await seek(26.5);
  await expect(page.locator('#typed-distance')).toHaveText('50');
  await expect(page.locator('#route-ready')).toHaveCSS('opacity', '1');
  await seek(36);
  await expect(page.locator('#nav-hud')).toHaveCSS('opacity', '1');
  const before = await page.locator('#map-rider').getAttribute('transform');
  await seek(38);
  expect(await page.locator('#map-rider').getAttribute('transform')).not.toEqual(before);
  await seek(48);
  await expect(page.locator('#food-card')).toHaveCSS('opacity', '1');
  await expect(page.locator('#food-cta-label')).toHaveText('Add a delicious detour');
  await seek(52);
  await expect(page.locator('#food-cta-label')).toHaveText('✓ Added to your ride');
  await page.getByRole('button', { name: 'Clean view' }).click();
  await expect(page.locator('body')).toHaveClass('capture');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Exit clean view' })).toBeAttached();
  expect(await page.evaluate(() => (window as any).launchFilm.playing)).toBe(true);
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  // Escape must work even while a transport control owns focus.
  await expect(page.locator('body')).not.toHaveClass('capture');
  await seek(2);
  await page.getByRole('button', { name: 'Play film', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).launchFilm.time)).toBeGreaterThan(2.2);
  await page.getByRole('button', { name: 'Pause film', exact: true }).click();
  const paused = await page.evaluate(() => (window as any).launchFilm.time);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).launchFilm.time)).toBe(paused);
  for (const [t, name] of [[4, 'onboarding'], [26.5, 'route-planning'], [36, 'navigation'], [48, 'assistant']] as const) {
    await seek(t);
    await page.locator('#cinema').screenshot({ path: `docs/launch/${name}.png` });
  }
  for (let frame = 0; frame <= 120; frame++) await seek(frame / 2);
  await seek(60);
  await expect(page.locator('#outro')).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('launch film fits mobile and respects reduced motion on autoplay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(filmUrl + '?autoplay=1');
  expect(await page.evaluate(() => (window as any).launchFilm.playing)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: '05 Better bites' }).click();
  await expect(page.locator('#stage')).toHaveAttribute('data-chapter', '5');
});
