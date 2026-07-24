import axios, { AxiosInstance } from 'axios';
import type { IncomingHttpHeaders } from 'http';
import { env } from '../../config/env';
import { redis } from '../../infrastructure/redis/client';
import {
  PaymentStrategy, ProviderName, InitiateContext,
  InitiateResult, NormalizedStatus, WebhookEvent,
} from '../PaymentStrategy';

const TOKEN_KEY = 'bkash:grant_token';

export class BkashStrategy implements PaymentStrategy {
  readonly provider: ProviderName = 'BKASH';
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: env.BKASH_BASE_URL, timeout: 10_000 });
  }

  private async token(): Promise<string> {
    const cached = await redis.get(TOKEN_KEY);
    if (cached) return cached;

    const { data } = await this.http.post('/tokenized/checkout/token/grant', {
      app_key: env.BKASH_APP_KEY,
      app_secret: env.BKASH_APP_SECRET,
    }, {
      headers: { username: env.BKASH_USERNAME!, password: env.BKASH_PASSWORD! },
    });

    await redis.set(TOKEN_KEY, data.id_token, 'EX', 3000);
    return data.id_token;
  }

  private async authHeaders() {
    return { Authorization: await this.token(), 'X-App-Key': env.BKASH_APP_KEY! };
  }

  async initiate(ctx: InitiateContext): Promise<InitiateResult> {
    const { data } = await this.http.post(
      '/tokenized/checkout/create',
      {
        mode: '0011',
        payerReference: ctx.customerEmail,
        callbackURL: ctx.returnUrl,
        amount: ctx.amount.toDecimalString(),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: ctx.orderPublicId,
      },
      { headers: await this.authHeaders() },
    );

    return {
      transactionId: data.paymentID,
      clientPayload: { provider: 'BKASH', redirectUrl: data.bkashURL, paymentID: data.paymentID },
    };
  }

  async execute(paymentID: string): Promise<NormalizedStatus> {
    const { data } = await this.http.post(
      '/tokenized/checkout/execute',
      { paymentID },
      { headers: await this.authHeaders() },
    );
    return BkashStrategy.mapStatus(data.transactionStatus);
  }

  async verify(transactionId: string): Promise<NormalizedStatus> {
    const { data } = await this.http.post(
      '/tokenized/checkout/payment/status',
      { paymentID: transactionId },
      { headers: await this.authHeaders() },
    );
    return BkashStrategy.mapStatus(data.transactionStatus);
  }

  parseWebhook(): WebhookEvent {
    throw new Error('bKash does not provide webhooks; use the callback + execute flow');
  }

  private static mapStatus(s: string): NormalizedStatus {
    if (s === 'Completed') return 'SUCCESS';
    if (s === 'Initiated') return 'PENDING';
    return 'FAILED';
  }
}
