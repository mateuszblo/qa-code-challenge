import { test as base, expect } from '@playwright/test';
import { recordResponses } from '../utils/response-recorder.js';
import type { ResponseRecorder } from '../utils/response-recorder.js';
import type { LoginResponseBody } from '../types/api.types.js';

export type NetworkFixtures = {
  loginResponses: ResponseRecorder<LoginResponseBody>;
  failOnUncaughtPageError: void;
};

export const networkTest = base.extend<NetworkFixtures>({
  loginResponses: async ({ page }, use) => {
    const recorder = await recordResponses<LoginResponseBody>(page, '**/login', 'POST /login');
    await use(recorder);
    await page.unroute('**/login');
  },

  failOnUncaughtPageError: [
    async ({ page }, use) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await use();

      expect(pageErrors, 'page should render without uncaught JS errors').toEqual([]);
    },
    { auto: true },
  ],
});
