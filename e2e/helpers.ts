import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

/** Audyt axe (WCAG 2.1 A/AA) – mapa (canvas MapLibre) jest wyłączona, bo nie jest jedyną drogą obsługi. */
export async function axeCheck(page: Page, context: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.maplibregl-map')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (serious.length) console.log(`[axe:${context}]`, JSON.stringify(serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.html) })), null, 1));
  expect(serious, `axe (${context}) – naruszenia serious/critical`).toEqual([]);
  return results;
}

/** Przechodzi Tabem aż fokus trafi na element pasujący do nazwy dostępnej (max N kroków). */
export async function tabTo(page: Page, name: RegExp | string, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return '';
      return (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim();
    });
    if (typeof name === 'string' ? focused.includes(name) : name.test(focused)) return;
  }
  throw new Error(`Nie udało się dojść Tabem do: ${name}`);
}

export async function choosePlace(page: Page, inputLabel: string, query: string, resultPattern: RegExp) {
  const input = page.getByRole('textbox', { name: inputLabel });
  await input.click();
  await input.fill(query);
  const result = page.getByRole('button', { name: resultPattern }).first();
  await expect(result).toBeVisible();
  await result.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: `Zmień: ${inputLabel}` })).toBeVisible();
}

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** Token operatora z env lub z pliku .env w katalogu głównym (tylko do sprzątania po testach). */
export function operatorToken(): string | null {
  if (process.env.OPERATOR_TOKEN) return process.env.OPERATOR_TOKEN;
  try {
    const m = readFileSync(resolve(__dirname, '../.env'), 'utf8').match(/^OPERATOR_TOKEN=(.+)$/m);
    return m?.[1]?.trim().replace(/^"|"$/g, '') || null;
  } catch { return null; }
}

export async function deleteBarrier(id: string) {
  const token = operatorToken();
  if (!token) { console.warn(`Brak OPERATOR_TOKEN – bariera testowa ${id} pozostaje w bazie.`); return; }
  const res = await fetch(`${API_URL}/v1/operator/barriers/${id}`, { method: 'DELETE', headers: { 'x-operator-token': token } });
  if (!res.ok) console.warn(`Nie udało się usunąć bariery testowej ${id}: ${res.status}`);
}
