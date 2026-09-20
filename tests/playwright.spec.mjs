import { test, expect } from '@playwright/test';
const baseURL = process.env.MUKOROB_BASE_URL || 'http://127.0.0.1:4173';

test.describe('Mukorob PDF v0.7.4 smoke flows', () => {
  test('loads the branded shell and exposes core controls', async ({ page }) => {
    await page.goto(baseURL); await expect(page).toHaveTitle(/Mukorob PDF/);
    await expect(page.locator('#btnOpen')).toHaveCount(1);
    await expect(page.locator('#btnPrint')).toHaveCount(1);
    await expect(page.locator('#btnESignature')).toHaveCount(1);
    await expect(page.locator('#btnCompanyStamp')).toHaveCount(1);
    await expect(page.locator('#bootstrapView')).toHaveCount(1);
  });
  test('print surface exists and printing is implemented without window.open', async ({ page }) => {
    await page.goto(baseURL); await expect(page.locator('#mukorobPrintSurface')).toHaveCount(1);
    const source = await page.locator('body').evaluate(() => document.documentElement.outerHTML);
    expect(source).not.toContain('window.open(');
  });
  test('v0.7.4 migration module and test hooks are wired', async ({ page }) => {
    await page.goto(baseURL);
    expect(await page.evaluate(() => window.MukorobTestHooks?.version)).toBe('0.7.1');
    await expect(page.locator('#mkMigrationPanel')).toHaveCount(1, {timeout:10000});
    await expect(page.locator('#mkFirstRunRestore')).toHaveCount(1, {timeout:10000});
  });
});
