import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: Boolean(process.env.CI),
  timeout: 15_000,
  expect: {
    timeout: 5_000
  },
  outputDir: '.test-data/playwright-results',
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'line',
  use: {
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
})
