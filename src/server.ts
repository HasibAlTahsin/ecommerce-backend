import express from 'express';
import cors from 'cors';
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
import { mountSwagger } from './interfaces/http/swagger';
import { authLimiter, globalLimiter } from './interfaces/http/middlewares/rateLimit';
// Global patch to convert BigInt to JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
const app = express();
// Behind a reverse proxy in production, trust X-Forwarded-* so req.ip is the
// real client IP (needed for correct rate limiting and logging).
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
// CORS: allow the frontend origin(s) to call the API from the browser.
// Comma-separated list in CORS_ORIGINS env var; falls back to allowing all in dev.
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  }),
);
// 1. Webhooks FIRST, with a raw body parser scoped to them only.
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRouter);
// 2. Global JSON parser AFTER. Everything else gets a parsed body.
app.use(express.json({ limit: '100kb' }));
// 3. API docs (Swagger UI).
mountSwagger(app);
// 4. Rate limiting (skipped under test so the suite is not throttled).
if (process.env.NODE_ENV !== 'test') {
  app.use(globalLimiter);
}
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
const authMiddlewares =
  process.env.NODE_ENV !== 'test' ? [authLimiter, authRouter] : [authRouter];
app.use('/api/auth', ...authMiddlewares);
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
