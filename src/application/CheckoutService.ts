import { PrismaClient } from '@prisma/client';
import { PaymentRegistry } from '../payments/PaymentRegistry';
import { ProviderName } from '../payments/PaymentStrategy';
import { Money } from '../domain/Money';
import { env } from '../config/env';
import { InvalidStateTransitionError } from '../domain/errors';

export class CheckoutService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: PaymentRegistry,
  ) {}

  async start(userId: bigint, orderPublicId: string, provider: ProviderName) {
    const order = await this.prisma.order.findFirst({
      where: { publicId: orderPublicId, userId },
      include: { items: true, user: true },
    });
    if (!order) throw new Error('Order not found');
    if (order.status !== 'PENDING') throw new InvalidStateTransitionError(order.status, 'checkout');

    // The ONLY provider-aware line in the entire application layer.
    const strategy = this.registry.resolve(provider);

    const result = await strategy.initiate({
      orderPublicId: order.publicId,
      amount: Money.fromMinor(order.totalMinor, order.currency),
      customerEmail: order.user.email,
      returnUrl: `http://localhost:3000/checkout/return`,
    });

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider,
        transactionId: result.transactionId,
        status: 'PENDING',
        amountMinor: order.totalMinor,
        currency: order.currency,
      },
    });

    return result.clientPayload;
  }
}
