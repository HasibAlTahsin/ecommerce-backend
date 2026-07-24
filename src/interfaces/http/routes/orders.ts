import { Router } from 'express';
import { z } from 'zod';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { OrderService, createOrderSchema } from '../../../application/OrderService';
import { CheckoutService } from '../../../application/CheckoutService';
import { ProviderName } from '../../../payments/PaymentStrategy';
import { prisma } from '../../../infrastructure/prisma/client';
import { buildPaymentRegistry } from '../../../payments/bootstrap';

export const orderRouter = Router();

const orderService = new OrderService(prisma);
const checkoutService = new CheckoutService(prisma, buildPaymentRegistry());

// Create Order
orderRouter.post('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const order = await orderService.create(req.user!.userId, createOrderSchema.parse(req.body));
    res.status(201).json(order);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.issues[0].message });
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    next(err);
  }
});

// Checkout
orderRouter.post('/:publicId/checkout', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const providerSchema = z.object({ provider: z.enum(['STRIPE', 'BKASH', 'MOCK']) });
    const { provider } = providerSchema.parse(req.body);
    const payload = await checkoutService.start(req.user!.userId, String(req.params.publicId), provider as ProviderName);   
    
    res.json(payload);
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.issues[0].message });
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    next(err);
  }
});

// Get my order (Security: 404, not 403, for another user's order)
orderRouter.get('/:publicId', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const order = await orderService.findForUser(req.user!.userId, String(req.params.publicId));
    res.json(order);
  } catch (err: any) {
    if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
    next(err);
  }
});
