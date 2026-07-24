import { Prisma, PrismaClient } from '@prisma/client';
import { InsufficientStockError } from '../../domain/errors';

export class StockRepository {
  /**
   * The guard and the write are ONE statement, so no interleaving is possible.
   * Postgres takes a row lock for the duration of the UPDATE.
   */
  async decrement(
    tx: Prisma.TransactionClient,
    productId: bigint,
    quantity: number,
  ): Promise<void> {
    const affected = await tx.$executeRaw`
      UPDATE products
         SET stock = stock - ${quantity},
             updated_at = NOW()
       WHERE id = ${productId}
         AND stock >= ${quantity}
    `;

    if (affected === 0) {
      throw new InsufficientStockError(String(productId), quantity, -1);
    }
  }

  /**
   * Multi-item orders: ALWAYS decrement in a consistent order to avoid deadlocks.
   */
  async decrementMany(
    tx: Prisma.TransactionClient,
    items: { productId: bigint; quantity: number }[],
  ): Promise<void> {
    const sorted = [...items].sort((a, b) =>
      a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0);
    for (const item of sorted) {
      await this.decrement(tx, item.productId, item.quantity);
    }
  }
}
