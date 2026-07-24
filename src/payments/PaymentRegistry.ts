import { PaymentStrategy, ProviderName } from './PaymentStrategy';

export class UnknownProviderError extends Error {
  readonly code = 'UNKNOWN_PROVIDER';
  readonly httpStatus = 400;
}

export class PaymentRegistry {
  private readonly strategies = new Map<ProviderName, PaymentStrategy>();

  register(strategy: PaymentStrategy): this {
    this.strategies.set(strategy.provider, strategy);
    return this;
  }

  resolve(provider: ProviderName): PaymentStrategy {
    const s = this.strategies.get(provider);
    if (!s) throw new UnknownProviderError(`Provider ${provider} is not enabled`);
    return s;
  }

  available(): ProviderName[] {
    return [...this.strategies.keys()];
  }
}
