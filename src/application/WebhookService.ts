import { PrismaClient } from '@prisma/client';
import { PaymentRegistry } from '../payments/PaymentRegistry';
import { StockRepository } from '../infrastructure/prisma/StockRepository';
import { ProviderName, WebhookEvent } from '../payments/PaymentStrategy';

export class WebhookService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: PaymentRegistry,
    private readonly stock: StockRepository,
  ) {}

  async handle(
    provider: ProviderName,
    rawBody: Buffer,
    headers: Record<string, unknown>,
  ): Promise<void> {
    // STEP 1 — Verify the signature against RAW BYTES.
    const event: WebhookEvent = this.registry
      .resolve(provider)
      .parseWebhook(rawBody, headers as never);

    // STEP 2 — Idempotency. Let the DATABASE decide.
    try {
      await this.prisma.processedWebhookEvent.create({
        data: { provider, eventId: event.eventId },
      });
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        console.log({ eventId: event.eventId }, 'duplicate webhook ignored');
        return;                     // 200 OK. Silence is the correct response.
      }
      throw e;
    }

    // STEP 3 — Resolve the payment.
    const payment = await this.prisma.payment.findUnique({
      where: {
        provider_transactionId: { provider, transactionId: event.transactionId },
      },
      include: { order: { include: { items: true } } },
    });

    if (!payment) {
      throw new Error(`Unknown transaction ${event.transactionId}`);
    }

    // STEP 4 — Terminal state guard (OUT-OF-ORDER delivery check).
    if (payment.status !== 'PENDING') {
      console.log({ paymentId: payment.id }, 'payment already terminal, ignoring');
      return;
    }

    if (event.status === 'PENDING') return;

    // STEP 5 — One transaction. All of it, or none of it.
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: event.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          rawResponse: event.raw as object,
        },
      });

      if (event.status === 'SUCCESS') {
        await this.stock.decrementMany(
          tx,
          payment.order.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        );
        await tx.order.update({ where: { id: payment.orderId }, data: { status: 'PAID' } });
      } else {
        await tx.order.update({ where: { id: payment.orderId }, data: { status: 'CANCELED' } });
      }
    });
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002';
}
