import { test, expect } from '@playwright/test';

test('documentation navigation, mobile layout and CPU lab export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Light, made portable.' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/website-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Documentation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quick start', exact: true })).toBeVisible();
  await page.getByLabel('Filter documentation topics').fill('probe');
  await expect(
    page
      .getByRole('navigation', { name: 'Documentation topics' })
      .getByRole('link', { name: 'Light probes' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Documentation topics' })
    .getByRole('link', { name: 'Light probes' })
    .click();
  await expect(page.getByRole('heading', { name: 'Light probes', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('link', { name: 'Examples', exact: false }).first().click();
  await expect(page.getByRole('heading', { name: 'Make light your own.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/website-mobile.png', fullPage: true });
  await page.locator('#backend').selectOption('cpu');
  await page.locator('#resolution').selectOption('64');
  await page.locator('#samples').selectOption('8');
  await page.locator('#bake').click();
  await expect(page.locator('#status')).toContainText('Bake complete', { timeout: 120_000 });
  await page.getByRole('button', { name: 'AO', exact: true }).click();
  await expect(page.locator('#atlas')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  expect((await download).suggestedFilename()).toBe('cornell-bake.zip');
  await page.locator('#reset').click();
  await expect(page.locator('#bake')).toBeEnabled();
  expect(errors).toEqual([]);
});
