import { PrismaClient } from '@prisma/client';
import { CategoryTreeService } from './CategoryTreeService';

export class RecommendationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tree: CategoryTreeService,
  ) {}

  async forProduct(productPublicId: string, limit = 10) {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { publicId: productPublicId },
      select: { id: true, categoryId: true },
    });

    const parentId = await this.tree.ancestorOf(String(product.categoryId));
    const rootId = parentId ?? String(product.categoryId);

    const categoryIds = (await this.tree.descendantIds(rootId)).map(BigInt);

    return this.prisma.product.findMany({
      where: {
        categoryId: { in: categoryIds },
        status: 'ACTIVE',
        id: { not: product.id },
      },
      orderBy: [{ categoryId: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { publicId: true, name: true, priceMinor: true, currency: true },
    });
  }
}
