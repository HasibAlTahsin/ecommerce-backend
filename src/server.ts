import express from 'express';
import { env } from './config/env';
import { authRouter } from './interfaces/http/routes/auth';
import { orderRouter } from './interfaces/http/routes/orders';
import { productRouter } from './interfaces/http/routes/products';
import { webhookRouter, setWebhookService } from './interfaces/http/routes/webhooks';
import { prisma } from './infrastructure/prisma/client';
import { redis } from './infrastructure/redis/client';
import { CategoryTreeService } from './application/CategoryTreeService';
import { RecommendationService } from './application/RecommendationService';
import { buildPaymentRegistry } from './payments/bootstrap';
import { WebhookService } from './application/WebhookService';
import { StockRepository } from './infrastructure/prisma/StockRepository';

// Global patch to convert BigInt to JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

// 1. Webhooks FIRST, with a raw body parser scoped to them only.
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRouter);

// 2. Global JSON parser AFTER. Everything else gets a parsed body.
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/products', productRouter);
app.use('/api/orders', orderRouter);

const treeService = new CategoryTreeService(prisma, redis);
const recommendationService = new RecommendationService(prisma, treeService);
const registry = buildPaymentRegistry();
const stockRepo = new StockRepository();
const webhookService = new WebhookService(prisma, registry, stockRepo);

setWebhookService(webhookService);

app.get('/api/products/:publicId/recommendations', async (req, res, next) => {
  try {
    const recs = await recommendationService.forProduct(req.params.publicId);
    res.json(recs);
  } catch (err) {
    next(err);
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
  });
}

export { app };
