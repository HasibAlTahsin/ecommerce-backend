export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly httpStatus = 409;
  constructor(public readonly productId: string, public readonly requested: number, public readonly available: number) {
    super(`Insufficient stock for ${productId}: requested ${requested}, available ${available}`);
  }
}

export class InvalidStateTransitionError extends DomainError {
  readonly code = 'INVALID_STATE_TRANSITION';
  readonly httpStatus = 409;
  constructor(from: string, to: string) {
    super(`Cannot transition from ${from} to ${to}`);
  }
}

export class ProductUnavailableError extends DomainError {
  readonly code = 'PRODUCT_UNAVAILABLE';
  readonly httpStatus = 422;
}
