import { test, expect } from '../../fixtures/index.js';
import { PRODUCT_FIXTURES } from '../../data/product.factory.js';
import { PRODUCT_COLUMNS } from '../../pages/dashboard.page.js';

test.describe('Product dashboard', { tag: '@dashboard' }, () => {
  test('renders every product returned by the API', async ({ dashboardPage }) => {
    const products = PRODUCT_FIXTURES.multiple;

    await dashboardPage.stubProducts(products);
    await dashboardPage.goto();

    await test.step('the table header describes every column', async () => {
      await expect(dashboardPage.columnHeaders).toHaveText([...PRODUCT_COLUMNS]);
    });

    await test.step('every product gets a row', async () => {
      await expect(dashboardPage.productRows).toHaveCount(products.length);
    });

    await test.step('each row shows its own product data', async () => {
      for (const [index, product] of products.entries()) {
        await expect(dashboardPage.cellsOfRow(index)).toHaveText([
          String(product.id),
          product.title,
          product.description,
          `$${product.price}`,
          String(product.rating),
          '',
        ]);
        await expect(dashboardPage.thumbnailOfRow(index)).toHaveAttribute('src', product.thumbnail);
        await expect(dashboardPage.thumbnailOfRow(index)).toHaveAttribute('alt', product.title);
      }
    });
  });

  test(
    'renders product text containing HTML punctuation intact',
    { tag: ['@expected-failure', '@rendering'] },
    async ({ dashboardPage }) => {
      test.fail(
        true,
        'QA_ASSESSMENT_REPORT.md M2 — unescaped innerHTML drops <Edition> as an unknown tag. Silent data loss.'
      );

      const [product] = PRODUCT_FIXTURES.edgeCases;

      await dashboardPage.stubProducts(PRODUCT_FIXTURES.edgeCases);
      await dashboardPage.goto();

      await expect(dashboardPage.cellOfRow(0, 'Title')).toHaveText(product.title);
      await expect(dashboardPage.cellOfRow(0, 'Description')).toHaveText(product.description);
    }
  );
});
