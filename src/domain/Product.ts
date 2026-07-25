import { Money } from './Money';
import { InsufficientStockError, ProductUnavailableError } from './errors';

export type ProductStatus = 'ACTIVE' | 'INACTIVE';

export class Product { 
constructor( 
public readonly id: string, 
public readonly sku: string, 
public readonly name: string, 
public readonly price: Money, 
private _stock: number, 
public readonly status: ProductStatus, 
) {} 

get stock(): number { return this._stock; } 

assertPurchasable(quantity: number): void { 
if (this.status !== 'ACTIVE') throw new ProductUnavailableError(`${this.sku} is not active`); 
if (this._stock < quantity) { 
throw new InsufficientStockError(this.id, quantity, this._stock); 
} 
} 

/** 
* This is for in-memory check only. 
* The actual stock will be reduced using the conditional SQL UPDATE, because this method is not safe in concurrency or race conditions.\
* This method in the domain layer is merely an advisory pre-check; the actual authoritative logic resides in the database query: `UPDATE ... WHERE stock >= qty`.
*/
reduceStock(quantity: number): void {
this.assertPurchasable(quantity);
this._stock -= quantity;
}
}
