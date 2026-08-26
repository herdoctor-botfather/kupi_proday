import { Injectable } from '@nestjs/common';
import type { Category } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Список для главного экрана. Счётчик считает только опубликованные карточки. */
  async findAll(): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { specialists: { where: { specialist: { status: 'ACTIVE' } } } },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      icon: row.icon,
      specialistCount: row._count.specialists,
    }));
  }
}
