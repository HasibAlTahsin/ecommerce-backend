import crypto from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import { 
PaymentStrategy, ProviderName, InitiateContext, 
InitiateResult, NormalizedStatus, WebhookEvent,
} from '../PaymentStrategy';

const MOCK_SECRET = 'mock_webhook_secret';

export class MockStrategy implements PaymentStrategy { 
readonly provider: ProviderName = 'MOCK'; 
private readonly store = new Map<string, NormalizedStatus>(); 

async initiate(ctx: InitiateContext): Promise<InitiateResult> { 
const transactionId = `mock_${crypto.randomUUID()}`; 
this.store.set(transactionId, 'PENDING'); 
return { 
transactionId, 
clientPayload: { 
provider: 'MOCK', 
transactionId, 
confirmUrl: `/api/payments/mock/${transactionId}/confirm`, 
amountMinor: ctx.amount.toMinor(), 
}, 
}; 
} 

async verify(transactionId: string): Promise<NormalizedStatus> { 
return this.store.get(transactionId) ?? 'FAILED'; 
} 

parseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookEvent { 
const signature = headers['x-mock-signature'] as string | undefined; 
if (!signature) throw new Error('Missing signature'); 

const expected = crypto.createHmac('sha256', MOCK_SECRET).update(rawBody).digest('hex'); 
const a = Buffer.from(signature); 
const b = Buffer.from(expected); 

// timingSafeEqual is used to prevent timing attacks 
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { 
throw new Error('Invalid signature'); 
} 

const body = JSON.parse(rawBody.toString('utf8')); 
return { 
eventId: body.id, 
transactionId: body.transactionId, 
status: body.status as NormalizedStatus, 
raw: body, 
}; 
} 

static sign(payload: object): { body: Buffer; signature: string } { 
const body = Buffer.from(JSON.stringify(payload)); 
return { 
body, 
signature: crypto.createHmac('sha256', MOCK_SECRET).update(body).digest('hex'), 
}; 
}
}
