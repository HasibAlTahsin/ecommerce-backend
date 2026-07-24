import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../../infrastructure/prisma/client';
import { authenticate, requireAdmin, AuthenticatedRequest } from '../middlewares/auth';

export const productRouter = Router();

const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  description: z.string().optional(),
  priceMinor: z.number().int().positive(),
  currency: z.string().length(3).default('USD'),
  stock: z.number().int().min(0),
  categoryPublicId: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
}).strict();

productRouter.post('/', authenticate, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = createProductSchema.parse(req.body);
    
    const category = await prisma.category.findUnique({ where: { publicId: data.categoryPublicId } });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const product = await prisma.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        description: data.description,
        priceMinor: data.priceMinor,
        currency: data.currency,
        stock: data.stock,
        status: data.status,
        categoryId: category.id,
      },
    });
    res.status(201).json({ publicId: product.publicId, name: product.name });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.issues[0].message });
    if (err.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' });
    next(err);
  }
});

productRouter.get('/', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE' },
      select: { publicId: true, name: true, priceMinor: true, currency: true, stock: true },
    });
    res.json(products);
  } catch (err) {
    next(err);
  }
});
