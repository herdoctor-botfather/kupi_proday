import { PrismaClient } from '@prisma/client';
import { CATEGORY_ATTRIBUTES } from './category-attributes';
import { CAREER_ATTRIBUTES, CAREER_TREE } from './career-tree';

/**
 * Приводит характеристики категорий к описанному в category-attributes.ts.
 *
 *   node dist/prisma/apply-category-attributes.js
 *
 * Запускается повторно сколько угодно раз. Значения, уже проставленные
 * в объявлениях, не трогаются: характеристика обновляется по паре
 * «категория + слаг», а связь с объявлением держится за её идентификатор.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  let created = 0;
  let updated = 0;
  let missing = 0;

  /*
   * У карьеры характеристики одни на все отрасли: график, опыт и оплата
   * спрашиваются и у повара, и у программиста. Перечислять их в каждой
   * из пятнадцати отраслей значило бы держать один список в пятнадцати
   * местах и однажды разойтись.
   */
  const careerAttributes = Object.fromEntries(
    CAREER_TREE.map((root) => [root.slug, CAREER_ATTRIBUTES]),
  );

  for (const [categorySlug, specs] of Object.entries({ ...CATEGORY_ATTRIBUTES, ...careerAttributes })) {
    const category = await prisma.category.findUnique({
      where: { slug: categorySlug },
      select: { id: true },
    });

    if (!category) {
      console.warn(`категория ${categorySlug} не найдена — пропускаю`);
      missing += 1;
      continue;
    }

    for (const [index, spec] of specs.entries()) {
      const data = {
        name: spec.name,
        kind: spec.kind ?? 'SELECT',
        options: spec.options ?? [],
        unit: spec.unit ?? null,
        required: spec.required ?? false,
        isStep: spec.isStep ?? false,
        filterable: spec.filterable ?? true,
        dependsOn: spec.dependsOn ?? null,
        sortOrder: (index + 1) * 10,
      } as const;

      const existing = await prisma.categoryAttribute.findUnique({
        where: { categoryId_slug: { categoryId: category.id, slug: spec.slug } },
        select: { id: true },
      });

      if (existing) {
        await prisma.categoryAttribute.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await prisma.categoryAttribute.create({
          data: { ...data, slug: spec.slug, categoryId: category.id },
        });
        created += 1;
      }
    }
  }

  console.log(`характеристик создано: ${created}, обновлено: ${updated}, категорий не найдено: ${missing}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
