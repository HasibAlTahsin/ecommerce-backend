export class CurrencyMismatchError extends Error {
constructor(a: string, b: string) {
super(`Cannot operate on ${a} and ${b}`);
}
}

export class Money {
private constructor(
public readonly minor: number,
public readonly currency: string,
) {
if (!Number.isInteger(minor)) throw new Error('Money must be integer minor units');
if (currency.length !== 3) throw new Error('Currency must be ISO 4217');
Object.freeze(this); // To make the object immutable
}

static fromMinor(minor: number, currency: string): Money {
return new Money(minor, currency.toUpperCase());
}

/** "12.50" -> 1250. The string is parsed so that no floats are expected. */ 
static fromDecimalString(value: string, currency: string): Money { 
const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim()); 
if (!m) throw new Error(`Invalid money string: ${value}`); 
const [, sign, whole, frac = '0'] = m; 
const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0')); 
return new Money(sign === '-' ? -minor : minor, currency.toUpperCase()); 
} 

private assertSame(other: Money): void { 
if (this.currency !== other.currency) { 
throw new CurrencyMismatchError(this.currency, other.currency); 
} 
} 

add(other: Money): Money { 
this. assertSame(other); 
return new Money(this.minor + other.minor, this.currency);
}

multiply(qty: number): Money {
if (!Number.isInteger(qty) || qty < 0) throw new Error('Quantity must be a non-negative integer');
return new Money(this.minor * qty, this.currency);
}

equals(other: Money): boolean {
return this.currency === other.currency && this.minor === other.minor;
}

isZero(): boolean { return this.minor === 0; }

/** For Stripe, they want minor units directly. */
toMinor(): number { return this.minor; }

/** For bKash, they want decimal strings. The conversion will be in one place. */
toDecimalString(): string {
const neg = this.minor < 0;
const abs = Math.abs(this.minor); 
return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`; 
} 

static zero(currency: string): Money { 
return new Money(0, currency.toUpperCase()); 
}
}
