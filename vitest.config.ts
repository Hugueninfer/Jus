import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Locally the tests drive the installed Google Chrome; CI installs Playwright's Chromium instead.
// `||` rather than `??` so an empty CI variable does not hide TF_BUILD (set on Azure Pipelines).
const onCi = Boolean(process.env.CI || process.env.TF_BUILD);

export default defineConfig({
  // Pre-bundled up front, otherwise Vite discovers them mid-run and reloads the test page on a clean checkout.
  optimizeDeps: {
    include: ['axe-core', 'bootstrap/js/dist/alert'],
  },
  test: {
    include: ['assets/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(onCi ? {} : { launchOptions: { channel: 'chrome' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
