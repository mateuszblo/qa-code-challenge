import type { Page, Locator } from '@playwright/test';
import type { Product } from '../types/api.types.js';

export const PRODUCT_COLUMNS = [
  'ID',
  'Title',
  'Description',
  'Price',
  'Rating',
  'Thumbnail',
] as const;

type ProductColumn = (typeof PRODUCT_COLUMNS)[number];

export class DashboardPage {
  readonly page: Page;
  readonly logoutButton: Locator;
  readonly columnHeaders: Locator;
  readonly productRows: Locator;

  constructor(page: Page) {
    this.page = page;
    /* The one element that only an authenticated session renders — the "Welcome, User!" heading is
     * static markup and shows regardless of login state, so it proves nothing. */
    this.logoutButton = this.page.getByRole('button', { name: 'Logout' });

    const productTable = this.page.getByRole('table');
    this.columnHeaders = productTable.getByRole('columnheader');
    this.productRows = productTable.locator('tbody tr');
  }

  async goto() {
    await this.page.goto('/dashboard.html');
  }

  async stubProducts(products: Product[]): Promise<void> {
    await this.page.route('**/products', (route) => route.fulfill({ json: products }));
  }

  cellsOfRow(index: number): Locator {
    return this.productRows.nth(index).getByRole('cell');
  }

  cellOfRow(index: number, column: ProductColumn): Locator {
    return this.cellsOfRow(index).nth(PRODUCT_COLUMNS.indexOf(column));
  }

  thumbnailOfRow(index: number): Locator {
    return this.cellOfRow(index, 'Thumbnail').getByRole('img');
  }
}
