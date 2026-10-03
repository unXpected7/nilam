import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src/e2e',
  timeout: 30_000,
  use: { baseURL: process.env.ERP_E2E_BASE_URL || 'http://127.0.0.1:4000', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:4000/api/health',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
