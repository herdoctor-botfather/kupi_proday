import { Injectable } from '@nestjs/common';
import type { ProfileViewItem, SpecialistListItem } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { listInclude, toListItem } from '../specialists/specialists.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** История просмотров для личного кабинета. */
  async findViewHistory(userId: string, limit = 50): Promise<ProfileViewItem[]> {
    const rows = await this.prisma.profileView.findMany({
      where: { userId, specialist: { status: 'ACTIVE' } },
      include: { specialist: { include: listInclude } },
      orderBy: { viewedAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => ({
      specialist: toListItem(row.specialist),
      viewedAt: row.viewedAt.toISOString(),
    }));
  }

  async clearViewHistory(userId: string): Promise<void> {
    await this.prisma.profileView.deleteMany({ where: { userId } });
  }

  async findFavorites(userId: string): Promise<SpecialistListItem[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId, specialist: { status: 'ACTIVE' } },
      include: { specialist: { include: listInclude } },
      orderBy: { createdAt: 'desc' },
    });
    // Всё в этом списке избранное по определению — проставляем сразу.
    return rows.map((row) => ({ ...toListItem(row.specialist), isFavorite: true }));
  }

  /** Переключает избранное и возвращает новое состояние. */
  async toggleFavorite(userId: string, specialistId: string): Promise<{ isFavorite: boolean }> {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_specialistId: { userId, specialistId } },
    });

    if (existing) {
      await this.prisma.favorite.delete({ where: { userId_specialistId: { userId, specialistId } } });
      return { isFavorite: false };
    }

    await this.prisma.favorite.create({ data: { userId, specialistId } });
    return { isFavorite: true };
  }

  /**
   * Ставит свою фотографию профиля и убирает прежнюю из хранилища:
   * старые файлы никто не увидит, а место они занимают.
   */
  async setAvatar(userId: string, file: { url: string; key: string }): Promise<{ photoUrl: string }> {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: file.url, avatarKey: file.key },
    });

    if (before?.avatarKey) await this.storage.remove(before.avatarKey);

    return { photoUrl: file.url };
  }}
