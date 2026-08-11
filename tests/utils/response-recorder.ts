import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export type RecordedResponse<T> = {
  status: number;
  body: T;
};

export type ResponseRecorder<T> = {
  waitForFirst(): Promise<RecordedResponse<T>>;
};

export async function recordResponses<T>(
  page: Page,
  urlPattern: string,
  label = urlPattern
): Promise<ResponseRecorder<T>> {
  const recorded: RecordedResponse<T>[] = [];

  await page.route(urlPattern, async (route) => {
    const response = await route.fetch();
    recorded.push({ status: response.status(), body: (await response.json()) as T });
    await route.fulfill({ response });
  });

  return {
    async waitForFirst() {
      await expect
        .poll(() => recorded.length, { message: `${label} was never intercepted` })
        .toBeGreaterThan(0);
      return recorded[0];
    },
  };
}
