import { Injectable } from '@nestjs/common';
import type { Category, CategoryAttribute, CategoryKind, ListingKind } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Список категорий для главного экрана.
   *
   * Наборы для услуг и товаров разные, поэтому вид обязателен: показать
   * «Электронику» в каталоге мастеров было бы бессмысленно. Счётчик считает
   * только опубликованное — предлагать пустую категорию незачем.
   *
   * У товаров считаем отдельно продажу и запросы на покупку. Раньше они
   * складывались вместе, и на плитке стояло «2 объявления», а внутри было
   * одно: витрина показывает только продажу. Счётчик должен обещать ровно
   * то, что откроется после нажатия.
   */
  async findAll(kind: CategoryKind = 'SERVICE', listingKind: ListingKind = 'SELL'): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true, kind },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select:
            kind === 'SERVICE'
              ? { specialists: { where: { specialist: { status: 'ACTIVE' } } } }
              : { listings: { where: { listing: { status: 'ACTIVE', kind: listingKind } } } },
        },
      },
    });

    const own = (row: (typeof rows)[number]): number =>
      kind === 'SERVICE'
        ? ((row._count as { specialists?: number }).specialists ?? 0)
        : ((row._count as { listings?: number }).listings ?? 0);

    const toCategory = (row: (typeof rows)[number], parentSlug: string | null): Category => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      kind: row.kind,
      itemCount: own(row),
      parentSlug,
    });

    /*
     * Наружу отдаём разделы с вложенными подкатегориями.
     *
     * Счётчик раздела складывается из своих объявлений и объявлений его
     * подкатегорий: на плитке «Транспорт» человек ждёт увидеть всё, что
     * внутри, а не только то, что кто-то положил прямо в корень.
     */
    const roots = rows.filter((row) => row.parentId === null);
    return roots.map((root) => {
      const children = rows.filter((row) => row.parentId === root.id).map((row) => toCategory(row, root.slug));
      const category = toCategory(root, null);
      return {
        ...category,
        itemCount: category.itemCount + children.reduce((sum, child) => sum + child.itemCount, 0),
        children,
      };
    });
  }


  /**
   * Характеристики категории вместе с унаследованными от раздела.
   *
   * «Марка» и «Модель» заведены у «Телефонов»: спрашивать их отдельно
   * у каждой полки внутри — значит держать один и тот же список в
   * десятке мест и однажды разойтись.
   */
  async attributes(slug: string): Promise<CategoryAttribute[]> {
    const ids: string[] = [];
    let current = await this.prisma.category.findUnique({
      where: { slug },
      select: { id: true, parentId: true },
    });

    for (let depth = 0; current && depth < 5; depth += 1) {
      ids.push(current.id);
      current = current.parentId
        ? await this.prisma.category.findUnique({
            where: { id: current.parentId },
            select: { id: true, parentId: true },
          })
        : null;
    }

    if (ids.length === 0) return [];

    const rows = await this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: ids } },
      orderBy: { sortOrder: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      options: row.options,
      unit: row.unit,
      required: row.required,
      isStep: row.isStep,
      filterable: row.filterable,
      dependsOn: row.dependsOn,
    }));
  }
}
