import type { Prisma, PrismaClient } from '@prisma/client';
import type { Review } from '@app/shared';

type ReviewWithUser = Prisma.ReviewGetPayload<{ include: { user: true } }>;

export function toReviewDto(
  row: ReviewWithUser,
  options: { includeModerationNote?: boolean } = {},
): Review {
  return {
    id: row.id,
    rating: row.rating,
    text: row.text,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    reply: row.replyText ? { text: row.replyText, createdAt: (row.repliedAt ?? row.updatedAt).toISOString() } : null,
    author: {
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      photoUrl: row.user.photoUrl,
    },
    // Причину отклонения видит только автор отзыва и админ.
    ...(options.includeModerationNote ? { moderationNote: row.moderationNote } : {}),
  };
}

/**
 * Пересчитывает денормализованный рейтинг карточки по опубликованным отзывам.
 * Вызывается после любой смены статуса отзыва — это единственный способ,
 * которым ratingAvg и ratingCount вообще меняются.
 */
export async function recalculateRating(
  prisma: PrismaClient | Prisma.TransactionClient,
  specialistId: string,
): Promise<void> {
  const stats = await prisma.review.aggregate({
    where: { specialistId, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.specialist.update({
    where: { id: specialistId },
    data: {
      ratingAvg: stats._avg.rating ?? 0,
      ratingCount: stats._count.rating,
    },
  });
}
