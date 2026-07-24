import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server';
import { MockStrategy } from '../../src/payments/strategies/MockStrategy';
import { prisma } from '../helpers/db';

describe('webhook idempotency', () => {
  it('reduces stock exactly once when the same event is delivered twice', async () => {
    const category = await prisma.category.create({ data: { name: 'Idem Cat', slug: `idem-${Date.now()}` } });
    const product = await prisma.product.create({
      data: { name: 'Idem Prod', sku: `IDEM-${Date.now()}`, priceMinor: 1000, currency: 'USD', stock: 10, categoryId: category.id }
    });
    const user = await prisma.user.create({ data: { email: `idem-${Date.now()}@example.com`, passwordHash: 'hash', role: 'CUSTOMER' } });
    const order = await prisma.order.create({
      data: { userId: user.id, totalMinor: 2000, currency: 'USD', status: 'PENDING', items: { create: { productId: product.id, quantity: 2, unitPriceMinor: 1000, subtotalMinor: 2000 } } }
    });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, provider: 'MOCK', transactionId: `mock_idem_${Date.now()}`, status: 'PENDING', amountMinor: 2000, currency: 'USD' }
    });

    const { body, signature } = MockStrategy.sign({
      id: `evt_dup_${Date.now()}`,
      transactionId: payment.transactionId,
      status: 'SUCCESS',
    });

    const send = () =>
      request(app)
        .post('/api/webhooks/mock')
        .set('content-type', 'application/json')
        .set('x-mock-signature', signature)
        .send(body.toString());

    await send().expect(200);
    await send().expect(200);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.stock).toBe(8); // 10 - 2 = 8

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe('PAID');
  });

  it('rejects a tampered payload', async () => {
    const category = await prisma.category.create({ data: { name: 'Tamper Cat', slug: `tamper-${Date.now()}` } });
    const product = await prisma.product.create({
      data: { name: 'Tamper Prod', sku: `TAMPER-${Date.now()}`, priceMinor: 1000, currency: 'USD', stock: 5, categoryId: category.id }
    });
    const user = await prisma.user.create({ data: { email: `tamper-${Date.now()}@example.com`, passwordHash: 'hash', role: 'CUSTOMER' } });
    const order = await prisma.order.create({
      data: { userId: user.id, totalMinor: 1000, currency: 'USD', status: 'PENDING', items: { create: { productId: product.id, quantity: 1, unitPriceMinor: 1000, subtotalMinor: 1000 } } }
    });
    const payment = await prisma.payment.create({
      data: { orderId: order.id, provider: 'MOCK', transactionId: `mock_tamper_${Date.now()}`, status: 'PENDING', amountMinor: 1000, currency: 'USD' }
    });

    const { signature } = MockStrategy.sign({
      id: `evt_x_${Date.now()}`, transactionId: payment.transactionId, status: 'SUCCESS',
    });

    await request(app)
      .post('/api/webhooks/mock')
      .set('content-type', 'application/json')
      .set('x-mock-signature', signature)
      .send(Buffer.from(JSON.stringify({
        id: 'evt_x', transactionId: payment.transactionId, status: 'SUCCESS', amount: 999999,
      })))
      .expect(400);
  });
});
