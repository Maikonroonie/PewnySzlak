import { expect, test } from '@playwright/test';
import { choosePlace } from './helpers';

test.describe('Odporność: odmowa GPS, offline, duży tekst, ograniczony ruch', () => {
  test('odmowa dostępu do lokalizacji daje czytelny komunikat i alternatywę', async ({ page, context }) => {
    await context.grantPermissions([]);
    await page.goto('/');
    await page.getByRole('button', { name: 'Początek trasy: użyj mojej lokalizacji' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 20_000 });
    await expect(alert).toContainText(/lokalizacj/i);
    await expect(alert).toContainText(/adres|mapie/i);
    // wyszukiwarka nadal działa
    await expect(page.getByRole('textbox', { name: 'Początek trasy' })).toBeVisible();
  });

  test('ostatnia trasa jest dostępna offline', async ({ page, context }) => {
    await page.goto('/');
    await choosePlace(page, 'Początek trasy', 'Rynek Główny 1', /^Rynek Główny 1\b/);
    await choosePlace(page, 'Cel', 'Wawel', /Wawel/);
    await page.getByTestId('plan-route').click();
    await expect(page.getByTestId('screen-route')).toBeVisible({ timeout: 30_000 });
    // Offline: blokujemy API, przeładowujemy aplikację (statyczny bundle może być w cache przeglądarki, więc blokujemy tylko API).
    await context.route('**/v1/**', (r) => r.abort('internetdisconnected'));
    await page.goto('/');
    await expect(page.getByText(/Serwer niedostępny – tryb offline/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Zapisana trasa/)).toBeVisible();
    await page.getByRole('button', { name: 'Otwórz trasę' }).click();
    await expect(page.getByTestId('screen-route')).toBeVisible();
    await expect(page.getByText(/Odcinki trasy \(\d+\)/)).toBeVisible();
    await page.getByTestId('open-text-view').click();
    await expect(page.getByTestId('screen-route-text').getByLabel(/Krok 1:/).first()).toBeVisible();
  });

  test('duże powiększenie tekstu (200 %) nie ukrywa funkcji ani nie powoduje przewijania poziomego', async ({ page }) => {
    await page.goto('/');
    // Powiększenie 200 % (odpowiednik zoomu przeglądarki / dużej czcionki systemowej)
    await page.evaluate(() => { (document.body.style as unknown as { zoom: string }).zoom = '2'; });
    await expect(page.getByRole('heading', { name: 'Dokąd chcesz dojść?' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    await expect(page.getByTestId('plan-route')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zmień preferencje trasy' })).toBeVisible();
    await page.goto('/preferences');
    await page.evaluate(() => { (document.body.style as unknown as { zoom: string }).zoom = '2'; });
    await expect(page.getByRole('switch', { name: 'Omijaj schody' })).toBeVisible();
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow2).toBeLessThanOrEqual(2);
  });

  test('preferencja „ograniczony ruch” jest respektowana (brak animacji przejść)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const reduce = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    expect(reduce).toBe(true);
    await page.getByRole('button', { name: 'Zmień preferencje trasy' }).click();
    await expect(page.getByRole('heading', { name: 'Moje preferencje' })).toBeVisible();
    // Brak animowanych elementów CSS w drzewie (react-navigation web z animation: 'none')
    const animated = await page.evaluate(() => Array.from(document.querySelectorAll('*')).filter((el) => { const s = getComputedStyle(el); return s.animationName !== 'none' && s.animationDuration !== '0s'; }).length);
    expect(animated).toBe(0);
  });
});
