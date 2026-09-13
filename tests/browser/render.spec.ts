import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('GPU transport, progressive camera rendering and portable models', async ({ page }) => {
  await page.goto('/__tests.html');
  await page.waitForFunction(
    () => Reflect.get(window, '__TEST_DONE__') === true,
    {},
    { timeout: 580_000 },
  );
  const report = await page.evaluate(() => Reflect.get(window, '__TEST_REPORT__'));
  await mkdir('artifacts/renders', { recursive: true });
  await writeFile('artifacts/gpu-tests.json', JSON.stringify(report, null, 2));
  const renders = await page.evaluate(() => Reflect.get(window, '__RENDER_FILES__') ?? []);
  for (const render of renders)
    await writeFile(
      `artifacts/renders/${render.name}`,
      Buffer.from(render.data.split(',')[1], 'base64'),
    );
  expect(report.status, JSON.stringify(report, null, 2)).toBe('passed');
  expect(report.tests.length).toBeGreaterThanOrEqual(15);
});
