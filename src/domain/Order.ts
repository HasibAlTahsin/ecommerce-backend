import { Money } from './Money';
import { InvalidStateTransitionError } from './errors';

export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELED' | 'EXPIRED';

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = { 
PENDING: ['PAID', 'CANCELED', 'EXPIRED'], 
PAID: [], 
CANCELED: [], 
EXPIRED: [],
};

export class OrderItem { 
readonly subtotal: Money; 

constructor( 
public readonly productId: string, 
public readonly quantity: number, 
public readonly unitPrice: Money, 
) { 
if (!Number.isInteger(quantity) || quantity < 1) { 
throw new Error('Quantity must be a positive integer'); 
} 
this.subtotal = unitPrice.multiply(quantity); 
Object.freeze(this); 
}
}

export class Order {
private _status: OrderStatus;

constructor(
public readonly id: string,
public readonly userId: string,
public readonly items: readonly OrderItem[],
status: OrderStatus = 'PENDING',
) {
if (items.length === 0) throw new Error('Order must contain at least one item');
this._status = status;
}

get status(): OrderStatus { return this._status; }

/**
* Deterministic: multiplication and addition of whole numbers.
* The client will never be able to send the total, the server will calculate it itself.
*/
calculateTotal(): Money {
return this.items.reduce(
(sum, item) => sum.add(item.subtotal),
Money.zero(this.items[0].unitPrice.currency),
);
} 

private transition(to: OrderStatus): void { 
if (!TRANSITIONS[this._status].includes(to)) { 
throw new InvalidStateTransitionError(this._status, to); 
} 
this._status = to; 
} 

markPaid(): void { this.transition('PAID'); } 
cancel(): void { this.transition('CANCELED'); } 
expire(): void { this.transition('EXPIRED'); } 

isTerminal(): boolean { return TRANSITIONS[this._status].length === 0; }
}
