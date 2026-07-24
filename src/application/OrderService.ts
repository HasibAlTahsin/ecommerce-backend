import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { Money } from '../domain/Money';
import { Order, OrderItem } from '../domain/Order';
import { InsufficientStockError, ProductUnavailableError } from '../domain/errors';

export const createOrderSchema = z.object({
  items: z.array(z.object({
    productPublicId: z.string(),
    quantity: z.number().int().positive().max(100),
  })).min(1).max(50),
  idempotencyKey: z.string().uuid().optional(),
}).strict();

export class OrderService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: bigint, input: z.infer<typeof createOrderSchema>) {
    const publicIds = input.items.map((i) => i.productPublicId);

    // Load CURRENT prices from the database.
    const products = await this.prisma.product.findMany({
      where: { publicId: { in: publicIds } },
      select: { id: true, publicId: true, priceMinor: true, currency: true, stock: true, status: true },
    });

    if (products.length !== publicIds.length) {
      throw new ProductUnavailableError('One or more products do not exist');
    }

    const byPublicId = new Map(products.map((p) => [p.publicId, p]));
    const currency = products[0].currency;

    const domainItems = input.items.map((line) => {
      const p = byPublicId.get(line.productPublicId)!;
      if (p.status !== 'ACTIVE') throw new ProductUnavailableError(`${p.publicId} is not active`);
      if (p.currency !== currency) throw new Error('Mixed-currency orders are not supported');
      
      // Advisory pre-check only.
      if (p.stock < line.quantity) {
        throw new InsufficientStockError(p.publicId, line.quantity, p.stock);
      }
      return new OrderItem(p.publicId, line.quantity, Money.fromMinor(p.priceMinor, p.currency));
    });

    const total = new Order('pending', String(userId), domainItems).calculateTotal();

    return this.prisma.order.create({
      data: {
        userId,
        totalMinor: total.toMinor(),
        currency,
        status: 'PENDING',
        idempotencyKey: input.idempotencyKey,
        items: {
          create: domainItems.map((item) => ({
            productId: byPublicId.get(item.productId)!.id,
            quantity: item.quantity,
            unitPriceMinor: item.unitPrice.toMinor(),
            subtotalMinor: item.subtotal.toMinor(),
          })),
        },
      },
      include: { items: true },
    });
  }
  /** 404, not 403, for another user's order — do not leak existence. */
  async findForUser(userId: bigint, publicId: string) {
    const order = await this.prisma.order.findFirst({
      where: { publicId, userId },
      include: { items: true, payments: true },
    });
    if (!order) {
      const err = new Error('Order not found') as any;
      err.httpStatus = 404;
      throw err;
    }
    return order;
  }
}
