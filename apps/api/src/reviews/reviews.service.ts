import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateReviewDto, Paginated, Review } from '@app/shared';
import { PAGE_SIZE_DEFAULT } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { recalculateRating, toReviewDto } from './reviews.mapper';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Публичный список отзывов: только прошедшие модерацию. */
  async findForSpecialist(
    specialistId: string,
    page = 1,
    pageSize = PAGE_SIZE_DEFAULT,
  ): Promise<Paginated<Review>> {
    const where = { specialistId, status: 'APPROVED' as const };
    const skip = (page - 1) * pageSize;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items: rows.map((row) => toReviewDto(row)),
      total,
      page,
      pageSize,
      hasMore: skip + rows.length < total,
    };
  }

  /**
   * Создать или переписать свой отзыв. Повторная отправка заменяет прежний
   * и снова отправляет его на модерацию — иначе правкой текста можно было бы
   * обойти проверку.
   */
  async upsertOwn(specialistId: string, userId: string, dto: CreateReviewDto): Promise<Review> {
    const specialist = await this.prisma.specialist.findUnique({
      where: { id: specialistId },
      select: { id: true, status: true, userId: true },
    });

    if (!specialist || specialist.status !== 'ACTIVE') {
      throw new NotFoundException({ code: 'SPECIALIST_NOT_FOUND', message: 'Специалист не найден' });
    }
    if (specialist.userId && specialist.userId === userId) {
      throw new ForbiddenException({ code: 'SELF_REVIEW', message: 'Нельзя оценивать собственную карточку' });
    }

    const data = {
      rating: dto.rating,
      text: dto.text?.trim() || null,
      status: 'PENDING' as const,
      moderationNote: null,
      moderatedAt: null,
      moderatedByUserId: null,
    };

    const review = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.upsert({
        where: { specialistId_userId: { specialistId, userId } },
        create: { specialistId, userId, ...data },
        update: data,
        include: { user: true },
      });
      // Отзыв ушёл в PENDING — если он раньше был опубликован, рейтинг надо пересчитать.
      await recalculateRating(tx, specialistId);
      return saved;
    });

    void this.notifications.notifyStaff('💬 <b>Новый отзыв на модерации</b>');

    return toReviewDto(review, { includeModerationNote: true });
  }

  /** Отзывы текущего пользователя для личного кабинета, включая ожидающие модерации. */
  async findOwn(userId: string): Promise<Review[]> {
    const rows = await this.prisma.review.findMany({
      where: { userId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toReviewDto(row, { includeModerationNote: true }));
  }

  async deleteOwn(reviewId: string, userId: string): Promise<void> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден' });
    if (review.userId !== userId) {
      throw new ForbiddenException({ code: 'NOT_OWN_REVIEW', message: 'Это не ваш отзыв' });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });
      await recalculateRating(tx, review.specialistId);
    });
  }
}
