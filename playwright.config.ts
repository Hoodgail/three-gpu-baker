import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 600_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  outputDir: 'artifacts/playwright',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH,
      args: [
        '--enable-unsafe-webgpu',
        ...(process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : []),
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
