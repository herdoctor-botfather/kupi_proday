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
  // Характеристики показываем в карточке: память телефона и пробег
  // машины решают дело раньше, чем описание словами.
  attributes: { include: { attribute: true }, orderBy: { attribute: { sortOrder: 'asc' } } },
  photos: { orderBy: { sortOrder: 'asc' } },
  user: {
    select: {
      firstName: true,
      lastName: true,
      photoUrl: true,
      avatarUrl: true,
      // Анкета нужна, чтобы из объявления вести сразу в неё: там отзывы,
      // услуги и цены — куда больше, чем на странице с одними объявлениями.
      specialist: { select: { slug: true, status: true } },
    },
  },
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
    // Срочность показываем, только пока она не истекла: пометка на старом
    // объявлении обесценивает её на всех остальных.
    isUrgent: row.isUrgent && (row.urgentUntil?.getTime() ?? 0) > Date.now(),
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
    attributes: row.attributes
      .map((value) => ({
        slug: value.attribute.slug,
        name: value.attribute.name,
        value: formatValue(value),
      }))
      .filter((item) => item.value !== ''),
    description: row.description,
    photos: row.photos.map((photo) => ({ id: photo.id, url: photo.url })),
    viewCount: row.viewCount,
    seller: {
      id: row.userId,
      // Только имя, без фамилии: покупателю важно, к кому он обращается,
      // а полное имя продавца к сделке ничего не добавляет.
      name: row.user.firstName,
      photoUrl: row.user.avatarUrl ?? row.user.photoUrl,
      // Адрес анкеты — только у опубликованной: вести покупателя
      // на скрытую или отклонённую карточку значит показать ему пустоту.
      specialistSlug: row.user.specialist?.status === 'ACTIVE' ? row.user.specialist.slug : null,
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

/**
 * Значение характеристики одной строкой.
 *
 * Число показывается с единицей измерения, «да/нет» — словами: сырое
 * «true» в карточке читается как ошибка, а не как ответ.
 */
function formatValue(value: {
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  attribute: { unit: string | null };
}): string {
  if (value.valueText) return value.valueText;
  if (value.valueNumber !== null) {
    const unit = value.attribute.unit;
    return unit ? `${value.valueNumber} ${unit}` : String(value.valueNumber);
  }
  if (value.valueBool !== null) return value.valueBool ? 'Да' : 'Нет';
  return '';
}
