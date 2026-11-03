import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Locally the tests drive the installed Google Chrome. CI installs Playwright's Chromium and runs the full browser in
// its new headless mode (the `chromium` channel), which is closer to Chrome than the headless shell Playwright would
// otherwise pick.
// `||` rather than `??` so an empty CI variable does not hide TF_BUILD (set on Azure Pipelines).
const onCi = Boolean(process.env.CI || process.env.TF_BUILD);

export default defineConfig({
  // Pre-bundled up front, otherwise Vite discovers them mid-run and reloads the test page on a clean checkout.
  optimizeDeps: {
    include: ['axe-core', 'bootstrap/js/dist/alert'],
  },
  css: {
    preprocessorOptions: {
      // The page stylesheet is compiled in the tests too (assets/styles/app.test.ts); as in webpack.config.js, keep
      // Bootstrap 5.3's own deprecation noise out of the output.
      scss: {
        quietDeps: true,
        silenceDeprecations: ['import'],
      },
    },
  },
  test: {
    include: ['assets/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { channel: onCi ? 'chromium' : 'chrome' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
