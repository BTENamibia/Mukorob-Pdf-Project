import { test, expect } from '@playwright/test';

const baseURL = process.env.MUKOROB_BASE_URL || 'http://127.0.0.1:4173';

test.describe('Mukorob PDF v0.7 smoke flows', () => {
  test('loads the branded shell and exposes core controls', async ({ page }) => {
    await page.goto(baseURL);
    await expect(page).toHaveTitle(/Mukorob PDF/);
    await expect(page.locator('#btnOpen')).toBeVisible();
    await expect(page.locator('#btnPrint')).toBeVisible();
    await expect(page.locator('#btnESignature')).toHaveCount(1);
    await expect(page.locator('#btnCompanyStamp')).toHaveCount(1);
  });

  test('print implementation is native, not iframe/window.open', async ({ page }) => {
    await page.goto(baseURL);
    const source = await page.locator('body').evaluate(() => document.documentElement.outerHTML);
    expect(source).not.toContain('window.open(');
    await expect(page.locator('#mukorobPrintSurface')).toHaveCount(1);
  });

  test('v0.7 test hooks are available', async ({ page }) => {
    await page.goto(baseURL);
    expect(await page.evaluate(() => window.MukorobTestHooks?.version)).toBe('0.7.0');
  });
});
