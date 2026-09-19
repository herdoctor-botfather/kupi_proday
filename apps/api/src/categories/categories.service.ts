import { Injectable } from '@nestjs/common';
import type { Category, CategoryKind, ListingKind } from '@app/shared';
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

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      kind: row.kind,
      itemCount:
        kind === 'SERVICE'
          ? ((row._count as { specialists?: number }).specialists ?? 0)
          : ((row._count as { listings?: number }).listings ?? 0),
    }));
  }
}
