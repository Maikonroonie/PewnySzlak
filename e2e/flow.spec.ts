import { expect, test } from '@playwright/test';
import { axeCheck, choosePlace, deleteBarrier, tabTo } from './helpers';

const createdBarriers: string[] = [];
test.afterAll(async () => { for (const id of createdBarriers) await deleteBarrier(id); });

test.describe('PewnySzlak – pełny przepływ (web, klawiatura + axe)', () => {
  test('preferencje → trasa → szczegóły źródeł → widok tekstowy → prowadzenie → zgłoszenie bariery', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dokąd chcesz dojść?' })).toBeVisible();
    await axeCheck(page, 'planner');

    // Preferencje – tylko klawiatura
    await tabTo(page, 'Zmień preferencje trasy');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Moje preferencje' })).toBeVisible();
    await axeCheck(page, 'preferences');
    const kerb4 = page.getByRole('radio', { name: /^4 cm/ });
    await kerb4.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('radio', { name: '4 cm, wybrane' })).toBeVisible();
    await page.getByRole('button', { name: 'Gotowe' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Dokąd chcesz dojść?' })).toBeVisible();
    await expect(page.getByText(/krawężnik ≤ 4 cm/)).toBeVisible();

    // Start i cel przez wyszukiwarkę (lokalny indeks OSM)
    await choosePlace(page, 'Początek trasy', 'Rynek Główny 1', /^Rynek Główny 1\b/);
    await choosePlace(page, 'Cel', 'Wawel', /Wawel/);

    await page.getByTestId('plan-route').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: /\d+(,\d+)? (m|km) · ok\./ })).toBeVisible({ timeout: 30_000 });
    await axeCheck(page, 'route');
    await expect(page.getByText(/Odcinki trasy \(\d+\)/)).toBeVisible();

    // Szczegóły odcinka – źródło, data edycji OSM ≠ data sprawdzenia
    const firstSegment = page.getByRole('button', { name: /^1\. / }).first();
    await firstSegment.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Skąd to wiemy' })).toBeVisible();
    const segScreen = page.getByTestId('screen-segment');
    await expect(segScreen.getByText('OpenStreetMap').first()).toBeVisible();
    await expect(segScreen.getByText(/Sprawdzono w terenie: nie/).first()).toBeVisible();
    await expect(segScreen.getByText(/nie data sprawdzenia w terenie/)).toBeVisible();
    await axeCheck(page, 'segment');
    await page.getByRole('button', { name: 'Wróć' }).click();

    // Widok tekstowy
    await page.getByTestId('open-text-view').click();
    await expect(page.getByRole('heading', { name: 'Trasa krok po kroku' })).toBeVisible();
    await expect(page.getByTestId('screen-route-text').getByLabel(/Krok 1:/).first()).toBeVisible();
    await axeCheck(page, 'route-text');

    // Prowadzenie bez GPS (brak uprawnień) – tryb ręczny
    await page.getByRole('button', { name: 'Prowadź mnie' }).click();
    await expect(page.getByTestId('guide-instruction')).toBeVisible();
    const guide = page.getByTestId('screen-guide');
    await expect(guide.getByText('Brak lokalizacji')).toBeVisible({ timeout: 20_000 });
    const before = await page.getByTestId('guide-instruction').textContent();
    await page.getByTestId('next-step').click();
    await expect(guide.getByText(/Krok 2 z \d+/)).toBeVisible();
    expect(await page.getByTestId('guide-instruction').textContent()).not.toEqual(before);
    await axeCheck(page, 'guide');

    // Symulacja przejścia – instrukcja zmienia się automatycznie
    await page.getByRole('switch', { name: 'Symuluj przejście trasy' }).click();
    await expect(guide.getByText('SYMULACJA')).toBeVisible();
    await expect(guide.getByText(/Do celu \d+/)).toBeVisible();

    // Zgłoszenie bariery z ekranu prowadzenia → trwałość → feedback
    await page.getByRole('button', { name: 'Zgłoś barierę tutaj' }).click();
    await expect(page.getByRole('heading', { name: 'Zgłoś barierę' })).toBeVisible();
    await axeCheck(page, 'report');
    await page.getByRole('radio', { name: /^Przeszkoda na drodze/ }).click();
    await page.getByTestId('report-title').fill('E2E: kontener na chodniku (test automatyczny)');
    await page.getByTestId('report-submit').click();
    await expect(page.getByRole('heading', { name: 'E2E: kontener na chodniku (test automatyczny)' })).toBeVisible({ timeout: 20_000 });
    const barrierId = page.url().match(/\/barrier\/([0-9a-f-]{36})/)?.[1];
    expect(barrierId, 'adres URL zawiera id zgłoszonej bariery').toBeTruthy();
    createdBarriers.push(barrierId!);
    // trwałość: świeże pobranie z API
    const fetched = await (await fetch(`http://localhost:4000/v1/barriers/${barrierId}`)).json() as { barrier: { title: string; state: string } };
    expect(fetched.barrier.title).toBe('E2E: kontener na chodniku (test automatyczny)');
    expect(fetched.barrier.state).toBe('active');
    const barrierScreen = page.getByTestId('screen-barrier');
    await expect(barrierScreen.getByText('Niezweryfikowane zgłoszenie').first()).toBeVisible();
    await expect(barrierScreen.getByText('Bez formalnej weryfikacji')).toBeVisible();
    await axeCheck(page, 'barrier');
    await page.getByTestId('feedback-confirm').click();
    await expect(barrierScreen.getByText(/Dziękujemy za potwierdzenie/)).toBeVisible();
    // Potwierdzenie nie daje statusu „zweryfikowane”
    await expect(barrierScreen.getByText('Zweryfikowana przez operatora')).toHaveCount(0);
    // sprzątanie (operator) – zgłoszenie testowe nie może zostać w danych bieżących
    await deleteBarrier(barrierId!);
    createdBarriers.splice(createdBarriers.indexOf(barrierId!), 1);
  });

  test('tryb demo: trasa Rynek → Wawel omija remont na Grodzkiej i pokazuje awarię źródła', async ({ page }) => {
    await page.goto('/preferences');
    await page.getByRole('radio', { name: /^Demo/ }).click();
    await page.getByRole('button', { name: 'Gotowe' }).click();
    await page.goto('/');
    await expect(page.getByText(/Tryb DEMO/)).toBeVisible();
    await choosePlace(page, 'Początek trasy', 'Rynek Główny 1', /^Rynek Główny 1\b/);
    await choosePlace(page, 'Cel', 'Wawel', /Wawel/);
    await page.getByTestId('plan-route').click();
    await expect(page.getByRole('heading', { name: 'Trasa omija' })).toBeVisible({ timeout: 30_000 });
    const routeScreen = page.getByTestId('screen-route');
    await expect(routeScreen.getByText(/Remont nawierzchni ul\. Grodzkiej/).first()).toBeVisible();
    await expect(routeScreen.getByText('DEMO').first()).toBeVisible();
    // trasa nie prowadzi Grodzką
    await expect(routeScreen.getByRole('button', { name: /^\d+\. Chodnik Grodzka/ })).toHaveCount(0);
    await page.goto('/sources');
    await expect(page.getByTestId('screen-sources').getByText(/Niedostępne – używamy ostatnich pobranych danych/)).toBeVisible();
    await axeCheck(page, 'sources');
  });

  test('asystent nie potwierdza dostępności i podaje źródła', async ({ page }) => {
    await page.goto('/assistant');
    await page.getByTestId('assistant-input').fill('najbliższa poradnia rehabilitacyjna');
    await page.keyboard.press('Enter');
    const screen = page.getByTestId('screen-assistant');
    await expect(screen.getByText(/tryb regułowy/)).toBeVisible({ timeout: 20_000 });
    const body = await screen.innerText();
    expect(body).toMatch(/deklar/i);
    expect(body).not.toMatch(/jest dostępn/i);
    await expect(screen.getByText('Źródła').first()).toBeVisible();
    await axeCheck(page, 'assistant');
  });
});
