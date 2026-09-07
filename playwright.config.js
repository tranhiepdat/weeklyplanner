const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', timeout: 45000, workers: 1,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: 'node node_modules/next/dist/bin/next start -p 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: !process.env.CI },
});
