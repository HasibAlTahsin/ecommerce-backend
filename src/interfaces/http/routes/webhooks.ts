import { Router } from 'express';
import { ProviderName } from '../../../payments/PaymentStrategy';

export const webhookRouter = Router();

// We will inject the service from server.ts via a setter
let webhookService: any;

export function setWebhookService(service: any) {
  webhookService = service;
}

webhookRouter.post('/:provider', async (req, res, next) => {
  try {
    // req.body is a Buffer here because of express.raw() in server.ts.
    await webhookService.handle(
      String(req.params.provider).toUpperCase() as ProviderName,
      req.body as Buffer,
      req.headers as Record<string, unknown>,
    );
    res.status(200).json({ received: true });
    } catch (err: any) {
    console.error("Webhook Error:", err.message);
    if (err instanceof Error && (err.message.includes('signature') || err.message.includes('Missing'))) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

