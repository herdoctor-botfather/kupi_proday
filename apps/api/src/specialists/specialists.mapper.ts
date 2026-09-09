import type { Prisma } from '@prisma/client';
import type { SpecialistDetail, SpecialistListItem } from '@app/shared';

/** Набор связей, необходимый для карточки в списке. */
export const listInclude = {
  categories: { include: { category: true } },
} satisfies Prisma.SpecialistInclude;

/** Набор связей для полного профиля. */
export const detailInclude = {
  categories: { include: { category: true } },
  services: { orderBy: { sortOrder: 'asc' } },
  photos: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.SpecialistInclude;

type ListRow = Prisma.SpecialistGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.SpecialistGetPayload<{ include: typeof detailInclude }>;

export function toListItem(row: ListRow, distanceKm?: number): SpecialistListItem {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    headline: row.headline,
    photoUrl: row.photoUrl,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    ratingAvg: round1(row.ratingAvg),
    ratingCount: row.ratingCount,
    isPromoted: row.isPromoted,
    categories: row.categories.map(({ category }) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      icon: category.icon,
    })),
    ...(distanceKm !== undefined ? { distanceKm: round1(distanceKm) } : {}),
  };
}

export function toDetail(
  row: DetailRow,
  extras: { ratingBreakdown: Record<string, number>; myReview: SpecialistDetail['myReview'] },
): SpecialistDetail {
  return {
    ...toListItem(row as ListRow),
    about: row.about,
    address: row.address,
    // Писать можно только владельцу карточки: у заведённых администрацией
    // аккаунта нет, и сообщение ушло бы в никуда.
    canChat: row.userId !== null,
    userId: row.userId,
    // Контакты наружу не отдаются: общение идёт через чат приложения.
    // В базе они остаются — администрации они нужны для поддержки.
    services: row.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      priceAmount: s.priceAmount,
      currency: s.currency,
      priceIsFrom: s.priceIsFrom,
    })),
    photos: row.photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption })),
    ratingBreakdown: extras.ratingBreakdown,
    myReview: extras.myReview,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
