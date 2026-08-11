import { test, expect } from '../../fixtures/index.js';

test.describe('Security', { tag: '@security' }, () => {
  test(
    'a token the server never issued does not grant access to the dashboard',
    { tag: ['@expected-failure', '@authorization'] },
    async ({ page }) => {
      test.fail(
        true,
        'QA_ASSESSMENT_REPORT.md H2/H3 — the only gate is a non-null localStorage token, checked in the browser.'
      );

      await test.step('plant a forged session token', async () => {
        await page.goto('/');
        await page.evaluate(() => localStorage.setItem('token', 'forged-not-a-real-token'));
      });

      await test.step('the dashboard rejects it', async () => {
        await page.goto('/dashboard.html');
        await expect(page).toHaveURL(/\/(index\.html)?$/);
      });

      await test.step('no protected data is rendered', async () => {
        await expect(page.getByRole('table')).toHaveCount(0);
      });
    }
  );
});
