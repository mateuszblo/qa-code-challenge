import { test, expect } from '../../fixtures/index.js';
import { TEST_USERNAME, TEST_PASSWORD, TEST_WRONG_PASSWORD } from '../../config/env.js';
import { DashboardPage } from '../../pages/dashboard.page.js';

test.describe('Login Page', { tag: '@authentication' }, () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('logs in successfully with valid credentials', async ({
    page,
    loginPage,
    loginResponses,
  }) => {
    await test.step('login using correct credentials', async () => {
      await loginPage.loginViaForm(TEST_USERNAME, TEST_PASSWORD);
      await expect(page).toHaveURL(/dashboard\.html/);
    });

    await test.step('the authenticated page is actually rendered', async () => {
      await expect(new DashboardPage(page).logoutButton).toBeVisible();
    });

    await test.step('verify backend response', async () => {
      const { status, body } = await loginResponses.waitForFirst();
      expect(status).toBe(200);
      expect(body.accessToken).toBeTruthy();
      expect(body.username).toBe(TEST_USERNAME);
    });
  });

  test(
    'invalid credentials show an error and keep user on login page',
    { tag: ['@expected-failure', '@crashes-server'] },
    async ({ loginPage }) => {
      test.fail(
        true,
        'QA_ASSESSMENT_REPORT.md H1/L2 — server crashes on invalid login, UI shows "Network error".'
      );

      await test.step('submit invalid credentials', async () => {
        await loginPage.loginViaForm(TEST_USERNAME, TEST_WRONG_PASSWORD);
      });

      await test.step('verify UI feedback', async () => {
        await expect(loginPage.errorMessage).toHaveText('Invalid credentials. Please try again.');
      });
    }
  );
});
