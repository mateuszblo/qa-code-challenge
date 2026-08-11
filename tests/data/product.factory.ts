import type { Product } from '../types/api.types.js';

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Essence Mascara Lash Princess',
    description: 'The Essence Mascara Lash Princess is a popular mascara.',
    price: 9.99,
    rating: 4.94,
    thumbnail: 'https://cdn.dummyjson.com/products/images/beauty/1/thumbnail.png',
    ...overrides,
  };
}

export const PRODUCT_FIXTURES = {
  multiple: [
    makeProduct({ id: 1, title: 'First Product', price: 9.99, rating: 4.94 }),
    makeProduct({ id: 2, title: 'Second Product', price: 1250, rating: 2.1 }),
    makeProduct({ id: 3, title: 'Third Product', price: 0.5, rating: 5 }),
  ],
  edgeCases: [
    makeProduct({
      id: 42,
      title: 'Tom & Jerry\'s "Special" <Edition>',
      description: 'Contains & ampersands, "quotes" and <angle brackets>.',
      price: 0,
      rating: 0,
    }),
  ],
} satisfies Record<string, Product[]>;
