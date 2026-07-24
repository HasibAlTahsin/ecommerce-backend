import Stripe from 'stripe';
import type { IncomingHttpHeaders } from 'http';
import { env } from '../../config/env';
import {
  PaymentStrategy, ProviderName, InitiateContext,
  InitiateResult, NormalizedStatus, WebhookEvent,
} from '../PaymentStrategy';

export class StripeStrategy implements PaymentStrategy {
  readonly provider: ProviderName = 'STRIPE';
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' as any });
  }

  async initiate(ctx: InitiateContext): Promise<InitiateResult> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: ctx.amount.toMinor(),
        currency: ctx.amount.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { orderPublicId: ctx.orderPublicId },
      },
      { idempotencyKey: `order_${ctx.orderPublicId}` }
    );

    return {
      transactionId: intent.id,
      clientPayload: {
        provider: 'STRIPE',
        clientSecret: intent.client_secret,
      },
    };
  }

  async verify(transactionId: string): Promise<NormalizedStatus> {
    const intent = await this.stripe.paymentIntents.retrieve(transactionId);
    return StripeStrategy.mapStatus(intent.status);
  }

  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookEvent {
    const signature = headers['stripe-signature'] as string;

    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET!,
    );

    const intent = event.data.object as Stripe.PaymentIntent;

    return {
      eventId: event.id,
      transactionId: intent.id,
      status: StripeStrategy.mapEventType(event.type),
      raw: event,
    };
  }

  private static mapStatus(s: Stripe.PaymentIntent.Status): NormalizedStatus {
    if (s === 'succeeded') return 'SUCCESS';
    if (s === 'canceled') return 'FAILED';
    return 'PENDING';
  }

  private static mapEventType(type: string): NormalizedStatus {
    switch (type) {
      case 'payment_intent.succeeded':       return 'SUCCESS';
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':        return 'FAILED';
      default:                               return 'PENDING';
    }
  }
}
