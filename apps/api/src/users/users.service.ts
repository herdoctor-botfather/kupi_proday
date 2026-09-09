import { Injectable, NotFoundException } from '@nestjs/common';
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
  }
  /**
   * Публичный профиль пользователя.
   *
   * Отвечает на вопрос, который покупатель задаёт себе перед тем, как
   * написать: «кто это и что он ещё выставил». У случайного человека одно
   * объявление, у перекупщика — сорок одинаковых, и это видно сразу.
   *
   * Рейтинг и отзывы берутся из анкеты специалиста: они существуют только
   * там. У обычного продавца их нет — и придумывать пустую пятёрку вместо
   * честного «оценок пока нет» нельзя, иначе рейтинг перестанет что-либо
   * значить у всех.
   */
  async publicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        photoUrl: true,
        avatarUrl: true,
        createdAt: true,
        isBlocked: true,
        specialist: {
          select: {
            id: true,
            slug: true,
            displayName: true,
            headline: true,
            status: true,
            ratingAvg: true,
            ratingCount: true,
            // Прайс-лист прямо в профиле: человек, который и продаёт вещи,
            // и оказывает услуги, — это один человек, и разбираться, где
            // у него что, посетитель не обязан.
            services: {
              orderBy: { sortOrder: 'asc' },
              take: 6,
              select: { id: true, name: true, priceAmount: true, currency: true, priceIsFrom: true },
            },
          },
        },
      },
    });

    if (!user || user.isBlocked) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'Профиль не найден' });
    }

    const [listings, wanted] = await Promise.all([
      this.prisma.listing.count({ where: { userId, kind: 'SELL', status: 'ACTIVE' } }),
      this.prisma.listing.count({ where: { userId, kind: 'BUY', status: 'ACTIVE' } }),
    ]);

    const card = user.specialist?.status === 'ACTIVE' ? user.specialist : null;

    return {
      id: user.id,
      name: user.firstName,
      photoUrl: user.avatarUrl ?? user.photoUrl,
      joinedAt: user.createdAt.toISOString(),
      listings,
      wanted,
      specialist: card
        ? {
            id: card.id,
            slug: card.slug,
            displayName: card.displayName,
            headline: card.headline,
            ratingAvg: card.ratingAvg,
            ratingCount: card.ratingCount,
            services: card.services.map((service) => ({
              id: service.id,
              name: service.name,
              priceAmount: service.priceAmount,
              currency: service.currency,
              priceIsFrom: service.priceIsFrom,
            })),
          }
        : null,
    };
  }}
