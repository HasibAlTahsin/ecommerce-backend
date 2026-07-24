import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '../helpers/db';
import { redis } from '../../src/infrastructure/redis/client';
import { CategoryTreeService } from '../../src/application/CategoryTreeService';

describe('CategoryTreeService', () => {
  let electronicsId: string;

  beforeEach(async () => {
    await redis.flushdb();
    const electronics = await prisma.category.upsert({
      where: { slug: 'electronics' },
      update: {},
      create: { name: 'Electronics', slug: 'electronics' },
    });
    electronicsId = String(electronics.id);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries the database once across two traversals', async () => {
    const spy = vi.spyOn(prisma.category, 'findMany');
    const service = new CategoryTreeService(prisma, redis);

    await service.descendantIds(electronicsId);
    await service.descendantIds(electronicsId);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rebuilds after invalidation', async () => {
    const spy = vi.spyOn(prisma.category, 'findMany');
    const service = new CategoryTreeService(prisma, redis);

    await service.descendantIds(electronicsId);
    await service.invalidate();
    await service.descendantIds(electronicsId);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('serves from the database when redis is down', async () => {
    const broken = { get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) } as never;
    const service = new CategoryTreeService(prisma, broken);

    const result = await service.descendantIds(electronicsId);
    expect(result.length).toBeGreaterThan(0);
  });
});
