import { PrismaClient } from '@prisma/client';
import { PRODUCT_TREE, SERVICE_TREE, type CategoryNode } from './category-tree';
import { CAREER_TREE } from './career-tree';

/**
 * Приводит категории в базе к дереву из category-tree.ts.
 *
 * Запускается и на пустой базе, и на работающей:
 *
 *   node dist/prisma/apply-category-tree.js
 *
 * Ничего не удаляет. Категория, которой в дереве больше нет, остаётся
 * в базе и просто скрывается из каталога: к ней могут быть привязаны
 * живые объявления, и удаление порвало бы им связь. Существующие
 * категории переставляются в дерево по слагу — поэтому слаги в
 * category-tree.ts совпадают с прежними везде, где категория была.
 */
const prisma = new PrismaClient();

async function applyTree(tree: CategoryNode[], kind: 'PRODUCT' | 'SERVICE' | 'JOB'): Promise<Set<string>> {
  const seen = new Set<string>();

  for (const [index, root] of tree.entries()) {
    const rootRow = await prisma.category.upsert({
      where: { slug: root.slug },
      create: {
        slug: root.slug,
        name: root.name,
        icon: root.icon ?? '🧩',
        kind,
        sortOrder: (index + 1) * 10,
        parentId: null,
        isActive: true,
      },
      update: {
        name: root.name,
        icon: root.icon ?? '🧩',
        kind,
        sortOrder: (index + 1) * 10,
        parentId: null,
        isActive: true,
      },
    });
    seen.add(root.slug);

    for (const [childIndex, child] of (root.children ?? []).entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        create: {
          slug: child.slug,
          name: child.name,
          // Иконку ребёнок наследует от раздела: в списке подкатегорий
          // она не показывается, но где-то ещё пустое поле выглядело бы
          // поломкой.
          icon: root.icon ?? '🧩',
          kind,
          sortOrder: (childIndex + 1) * 10,
          parentId: rootRow.id,
          isActive: true,
        },
        update: {
          name: child.name,
          kind,
          sortOrder: (childIndex + 1) * 10,
          parentId: rootRow.id,
          isActive: true,
        },
      });
      seen.add(child.slug);
    }
  }

  return seen;
}

async function main(): Promise<void> {
  const products = await applyTree(PRODUCT_TREE, 'PRODUCT');
  const services = await applyTree(SERVICE_TREE, 'SERVICE');
  const careers = await applyTree(CAREER_TREE, 'JOB');
  const seen = new Set([...products, ...services, ...careers]);

  // Всё, чего в дереве нет, уходит из каталога, но остаётся в базе.
  const stale = await prisma.category.updateMany({
    where: { slug: { notIn: [...seen] }, isActive: true },
    data: { isActive: false },
  });

  const counts = await prisma.category.groupBy({
    by: ['kind'],
    where: { isActive: true },
    _count: true,
  });

  for (const row of counts) console.log(`${row.kind}: ${row._count} активных категорий`);
  console.log(`скрыто устаревших: ${stale.count}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
