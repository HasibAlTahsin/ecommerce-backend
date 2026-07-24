import { env } from '../config/env';
import { PaymentRegistry } from './PaymentRegistry';
import { StripeStrategy } from './strategies/StripeStrategy';
import { BkashStrategy } from './strategies/BkashStrategy';
import { MockStrategy } from './strategies/MockStrategy';

export function buildPaymentRegistry(): PaymentRegistry {
  const registry = new PaymentRegistry();
  if (env.MOCK_PAYMENTS_ENABLED) registry.register(new MockStrategy());
  if (env.STRIPE_ENABLED)        registry.register(new StripeStrategy());
  if (env.BKASH_ENABLED)         registry.register(new BkashStrategy());
  return registry;
}
