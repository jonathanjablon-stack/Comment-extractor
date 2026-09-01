import { defineConfig } from '@playwright/test';

const configuredPort = Number(process.env.CM_PLAYWRIGHT_PORT || 4173);
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new Error('CM_PLAYWRIGHT_PORT must be a valid TCP port.');
}

const host = '127.0.0.1';
const baseURL = `http://${host}:${configuredPort}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 75_000,
  expect: { timeout: 12_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['line']],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    acceptDownloads: true,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: `npm run build && node tools/serve.mjs`,
    url: `${baseURL}/index.html`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
