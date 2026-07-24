import { describe, it, expect } from 'vitest';
import { Money, CurrencyMismatchError } from '../../src/domain/Money';
import { Order, OrderItem } from '../../src/domain/Order';
import { InvalidStateTransitionError } from '../../src/domain/errors';

describe('Money', () => {
  it('parses decimal strings without float error', () => {
    expect(Money.fromDecimalString('12.50', 'USD').toMinor()).toBe(1250);
    expect(Money.fromDecimalString('0.07', 'USD').toMinor()).toBe(7);
    expect(Money.fromDecimalString('100', 'USD').toMinor()).toBe(10000);
  });

  it('round-trips to bKash decimal format', () => {
    expect(Money.fromMinor(1250, 'BDT').toDecimalString()).toBe('12.50');
    expect(Money.fromMinor(7, 'BDT').toDecimalString()).toBe('0.07');
  });

  it('refuses to mix currencies', () => {
    const usd = Money.fromMinor(100, 'USD');
    const bdt = Money.fromMinor(100, 'BDT');
    expect(() => usd.add(bdt)).toThrow(CurrencyMismatchError);
  });

  it('does not accumulate error across many additions', () => {
    let sum = Money.zero('USD');
    for (let i = 0; i < 1000; i++) sum = sum.add(Money.fromDecimalString('0.10', 'USD'));
    expect(sum.toMinor()).toBe(10000);
  });
});

describe('Order', () => {
  const item = (qty: number, minor: number) =>
    new OrderItem('p1', qty, Money.fromMinor(minor, 'USD'));

  it('computes total deterministically', () => {
    const order = new Order('o1', 'u1', [item(3, 1000), item(2, 550)]);
    expect(order.calculateTotal().toMinor()).toBe(3 * 1000 + 2 * 550);
  });

  it('rejects an illegal transition', () => {
    const order = new Order('o1', 'u1', [item(1, 100)]);
    order.markPaid();
    expect(() => order.cancel()).toThrow(InvalidStateTransitionError);
  });

  it('rejects an empty order', () => {
    expect(() => new Order('o1', 'u1', [])).toThrow();
  });
});
