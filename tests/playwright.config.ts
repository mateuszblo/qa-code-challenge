import { defineConfig, devices } from '@playwright/test';

/** Credentials are required, not optional — see README "Credentials". */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* Explicit: the test.fail() tripwires must wait out the assertion timeout before they can fail,
   * which is most of the suite's runtime — so these should be visible and tunable. */
  timeout: 30_000,
  expect: { timeout: 5_000 },
  /* Serial by choice, not by necessity. Measured 2026-08-11: --workers=4 --repeat-each=5 on the
   * chromium project passed 20/20 three runs running, so the suite is parallel-safe today. It stays
   * serial because the win is ~3s — runtime is dominated by test.fail() tripwires waiting out the
   * assertion timeout, which parallelism can't compress — and because /products can still crash the
   * server on upstream rate-limiting (QA_ASSESSMENT_REPORT.md H1). One worker keeps such a crash confined to the
   * test that caused it. Revisit once H1 is fixed. */
  workers: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    /* Not on-first-retry: retries are 0 locally, so that would mean a local failure never produces
     * a trace at all. */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@crashes-server/,
    },
    {
      /* @crashes-server tests kill the backend (QA_ASSESSMENT_REPORT.md H1). Isolating them in a project that
       * `dependencies` on `chromium` guarantees they run last, whatever the file order. Keyed on
       * @crashes-server, not @expected-failure: the other tripwires assert against stubbed data
       * and must not be serialised.
       *
       * TRADE-OFF: if any `chromium` test fails, Playwright skips this project entirely — the run
       * reports "1 did not run" and the crasher is never executed. That is documented, intended
       * Playwright behaviour with no override. It is invisible today because the tripwires keep
       * `chromium` green, but it will bite the first time someone fixes H2 or H3 without removing
       * the matching test.fail(). Recover with:
       *
       *   npx playwright test --project=chromium-crashers --no-deps
       *
       * Delete this whole project once H1 is fixed; the ordering problem disappears with it. */
      name: 'chromium-crashers',
      use: { ...devices['Desktop Chrome'] },
      grep: /@crashes-server/,
      dependencies: ['chromium'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    cwd: '../',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
