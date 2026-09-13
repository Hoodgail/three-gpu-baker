import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('four example scenes compile, bake and render with TSL', async ({ page }) => {
  await page.goto(`/__gallery.html?samples=${process.env.GALLERY_SAMPLES ?? 64}`);
  await page.waitForFunction(
    () => Reflect.get(window, 'galleryDone') === true,
    {},
    { timeout: 580_000 },
  );
  expect(await page.evaluate(() => Reflect.get(window, 'galleryError'))).toBeUndefined();
  const images = await page.evaluate(() => Reflect.get(window, 'gallery'));
  expect(images.length).toBe(4);
  await mkdir('artifacts/gallery', { recursive: true });
  for (const image of images)
    await writeFile(
      `artifacts/gallery/${image.id}.png`,
      Buffer.from(image.data.split(',')[1], 'base64'),
    );
});
