import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.createMany({
    data: [
      { email: 'admin@example.com', passwordHash: await argon2.hash('Admin123!'), role: 'ADMIN', isVerified: true },
      { email: 'user@example.com',  passwordHash: await argon2.hash('User123!'),  role: 'CUSTOMER', isVerified: true },
    ],
    skipDuplicates: true,
  });

  const tree = {
    Electronics: {
      Computers: ['Laptops', 'Desktops'],
      Audio: ['Headphones', 'Speakers'],
    },
    Home: {
      Kitchen: ['Cookware', 'Appliances'],
      Furniture: ['Chairs', 'Desks'],
    },
  };

  const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
  const leafIds: bigint[] = [];

  for (const [root, mids] of Object.entries(tree)) {
    const r = await prisma.category.upsert({
      where: { slug: slug(root) },
      update: {},
      create: { name: root, slug: slug(root) },
    });
    for (const [mid, leaves] of Object.entries(mids)) {
      const m = await prisma.category.upsert({
        where: { slug: slug(mid) },
        update: {},
        create: { name: mid, slug: slug(mid), parentId: r.id },
      });
      for (const leaf of leaves) {
        const l = await prisma.category.upsert({
          where: { slug: slug(leaf) },
          update: {},
          create: { name: leaf, slug: slug(leaf), parentId: m.id },
        });
        leafIds.push(l.id);
      }
    }
  }

  let n = 0;
  for (const categoryId of leafIds) {
    for (let i = 0; i < 3; i++) {
      n++;
      await prisma.product.upsert({
        where: { sku: `SKU-${String(n).padStart(4, '0')}` },
        update: {},
        create: {
          name: `Product ${n}`,
          sku: `SKU-${String(n).padStart(4, '0')}`,
          description: `Seeded product ${n}`,
          priceMinor: 1000 + n * 250,
          currency: 'USD',
          stock: 25,
          categoryId,
        },
      });
    }
  }

  console.log(`Seeded ${leafIds.length} leaf categories, ${n} products.`);
}

main().finally(() => prisma.$disconnect());
