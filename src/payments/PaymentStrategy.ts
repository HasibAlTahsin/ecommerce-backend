import type { IncomingHttpHeaders } from 'http';
import { Money } from '../domain/Money';

export type ProviderName = 'STRIPE' | 'BKASH' | 'MOCK';

export interface InitiateContext {
  orderPublicId: string;
  amount: Money;
  customerEmail: string;
  returnUrl?: string;
}

export interface InitiateResult {
  transactionId: string;
  clientPayload: Record<string, unknown>;
}

export type NormalizedStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface WebhookEvent {
  eventId: string;
  transactionId: string;
  status: NormalizedStatus;
  raw: unknown;
}

export interface PaymentStrategy {
  readonly provider: ProviderName;
  initiate(ctx: InitiateContext): Promise<InitiateResult>;
  verify(transactionId: string): Promise<NormalizedStatus>;
  parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookEvent;
}
