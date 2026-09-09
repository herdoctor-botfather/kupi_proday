import type { Prisma } from '@prisma/client';
import type { ListingDetail, ListingListItem, MyListing } from '@app/shared';

/** Связи для карточки в списке: категории и обложка. */
export const listInclude = {
  categories: { include: { category: true } },
  // Для витрины нужно только первое фото — остальные не грузим.
  photos: { orderBy: { sortOrder: 'asc' }, take: 1 },
} satisfies Prisma.ListingInclude;

export const detailInclude = {
  categories: { include: { category: true } },
  photos: { orderBy: { sortOrder: 'asc' } },
  user: { select: { firstName: true, lastName: true, photoUrl: true } },
} satisfies Prisma.ListingInclude;

type ListRow = Prisma.ListingGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.ListingGetPayload<{ include: typeof detailInclude }>;

export function toListItem(row: ListRow): ListingListItem {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    priceAmount: row.priceAmount,
    currency: row.currency,
    isNegotiable: row.isNegotiable,
    exchangeFor: row.exchangeFor,
    condition: row.condition,
    city: row.city,
    coverUrl: row.photos[0]?.url ?? null,
    createdAt: row.createdAt.toISOString(),
    categories: row.categories.map(({ category }) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      icon: category.icon,
    })),
  };
}

export function toDetail(row: DetailRow, viewerId: string | null): ListingDetail {
  return {
    ...toListItem({ ...row, photos: row.photos.slice(0, 1) } as ListRow),
    description: row.description,
    photos: row.photos.map((photo) => ({ id: photo.id, url: photo.url })),
    viewCount: row.viewCount,
    seller: {
      // Имя из Telegram здесь не показывается по той же причине, что
      // и в переписке: человек не выбирал его как вывеску на площадке.
      // Продавец объявления остаётся продавцом.
      name: 'Продавец',
      // Аватар из Telegram узнаваем не меньше имени — его тоже не отдаём.
      photoUrl: null,
    },
    isMine: row.userId === viewerId,
  };
}

export function toMyListing(row: DetailRow): MyListing {
  return {
    ...toDetail(row, row.userId),
    status: row.status,
    needsReview: row.needsReview,
    rejectionReason: row.rejectionReason,
    soldAt: row.soldAt?.toISOString() ?? null,
  };
}
