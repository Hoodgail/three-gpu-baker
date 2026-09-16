import { test, expect } from '@playwright/test';

for (const mode of ['generate', 'repack'] as const)
  test(`real xatlas WASM ${mode} packs two meshes into one usable global atlas`, async ({
    page,
  }) => {
    await page.goto('/');
    const result = await page.evaluate(async (mode) => {
      const { sharedAtlasExample } = await import('/tests/integration/uv-browser.ts');
      return sharedAtlasExample(mode);
    }, mode);
    expect(result.meshes).toBe(2);
    expect(result.covered).toBeGreaterThan(0);
    expect(result.mappings).toBe(4);
    expect(result.channels).toEqual([true, true]);
  });
