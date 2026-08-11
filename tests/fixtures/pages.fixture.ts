import type { Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';
import { DashboardPage } from '../pages/dashboard.page.js';
import { TEST_USERNAME, TEST_PASSWORD } from '../config/env.js';
import { networkTest } from './network.fixture.js';

export type PageFixtures = {
  loginPage: LoginPage;
  authenticatedPage: Page;
  dashboardPage: DashboardPage;
};

export const pagesTest = networkTest.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  authenticatedPage: async ({ page, loginPage, loginResponses }, use) => {
    await loginPage.goto();
    await loginPage.loginViaForm(TEST_USERNAME, TEST_PASSWORD);
    await page.waitForURL(/dashboard\.html/);
    await loginResponses.waitForFirst();
    await use(page);
  },

  dashboardPage: async ({ authenticatedPage }, use) => {
    await use(new DashboardPage(authenticatedPage));
  },
});
