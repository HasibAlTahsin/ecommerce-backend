import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../helpers/db';
import { StockRepository } from '../../src/infrastructure/prisma/StockRepository';

describe('stock decrement under concurrency', () => {
  const stock = new StockRepository();
  let productId: bigint;
  let categoryId: bigint;

  beforeEach(async () => {
    const cat = await prisma.category.create({
      data: { name: 'Test Cat', slug: `test-cat-${Date.now()}` }
    });
    categoryId = cat.id;

    const p = await prisma.product.create({
      data: {
        name: 'Race Test', 
        sku: `RACE-${Date.now()}`, 
        priceMinor: 1000,
        currency: 'USD', 
        stock: 1, 
        categoryId,
      },
    });
    productId = p.id;
  });

  it('allows exactly one of ten concurrent buyers to succeed', async () => {
    const attempts = Array.from({ length: 10 }, () =>
      prisma.$transaction((tx) => stock.decrement(tx, productId, 1))
        .then(() => 'ok' as const)
        .catch(() => 'failed' as const),
    );

    const results = await Promise.all(attempts);

    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'failed')).toHaveLength(9);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(after.stock).toBe(0); 
  });
});
