import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  LISTING_EXTRA_STARS,
  LISTING_FREE_PER_MONTH,
  LISTING_PROMOTIONS,
  SPECIALIST_PLANS,
  TOPUP_MAX_STARS,
  TOPUP_MIN_STARS,
  isListingPromotion,
  isSpecialistPlan,
  isTopupAmount,
  type CreateInvoiceDto,
  type ConfirmPaymentDto,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramStarsService } from './telegram-stars.service';

/** Начало текущего календарного месяца — граница бесплатного лимита. */
function monthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Продление от большей из двух дат: если срок ещё не вышел, новый период
 * добавляется к остатку, а не съедает его. Оплатив заранее, человек не
 * должен терять уже оплаченные дни.
 */
function extendFrom(current: Date | null | undefined, days: number, now = new Date()): Date {
  const base = current && current > now ? current : now;
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stars: TelegramStarsService,
  ) {}

  /**
   * Выставляет счёт и возвращает ссылку для Telegram.WebApp.openInvoice.
   *
   * Запись создаётся до похода в Telegram: подтверждение придёт отдельным
   * сообщением боту, и без сохранённого намерения было бы неизвестно, за
   * что заплатили. Неоплаченные записи так и остаются в состоянии PENDING —
   * это след попытки, а не мусор.
   */
  async createInvoice(userId: string, dto: CreateInvoiceDto): Promise<{ url: string; paymentId: string }> {
    const order = await this.describeOrder(userId, dto);
    const payload = `p_${randomUUID().replace(/-/g, '')}`;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        purpose: dto.purpose,
        stars: order.stars,
        plan: dto.plan ?? null,
        listingId: order.listingId ?? null,
        specialistId: order.specialistId ?? null,
        invoicePayload: payload,
      },
      select: { id: true },
    });

    const url = await this.stars.createInvoiceLink({
      title: order.title,
      description: order.description,
      payload,
      stars: order.stars,
    });

    return { url, paymentId: payment.id };
  }

  /**
   * Проверяет, что счёт ещё ждёт оплаты. Вызывается ботом на pre_checkout_query:
   * Telegram даёт на ответ десять секунд и трактует молчание как отказ.
   */
  async isAwaitingPayment(invoicePayload: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({
      where: { invoicePayload },
      select: { status: true },
    });
    return payment?.status === 'PENDING';
  }

  /**
   * Зачисляет оплату и выдаёт купленное.
   *
   * Идемпотентна: Telegram может прислать подтверждение повторно, и тогда
   * запись уже будет в состоянии PAID — второй раз ничего не выдаётся.
   * Защиту держит не только эта проверка, но и уникальность
   * telegramChargeId в базе: две одновременные попытки не разойдутся.
   */
  async confirm(dto: ConfirmPaymentDto): Promise<{ applied: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { invoicePayload: dto.invoicePayload },
      include: { user: { select: { telegramId: true } } },
    });

    if (!payment) {
      this.logger.warn(`Оплата по неизвестному счёту ${dto.invoicePayload}`);
      throw new NotFoundException('Счёт не найден');
    }

    if (payment.status === 'PAID') {
      this.logger.log(`Повторное подтверждение счёта ${dto.invoicePayload} — пропускаю`);
      return { applied: false };
    }

    // Платит тот же человек, кому выставлен счёт. Ссылку на счёт можно
    // переслать, и без этой проверки оплата чужой ссылкой досталась бы
    // не заплатившему.
    if (payment.user.telegramId.toString() !== dto.telegramUserId) {
      this.logger.warn(`Счёт ${dto.invoicePayload} оплачен чужим аккаунтом`);
      throw new ForbiddenException('Счёт выставлен другому пользователю');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', paidAt: new Date(), telegramChargeId: dto.telegramChargeId },
      });

      if (payment.purpose === 'SPECIALIST_SUBSCRIPTION') {
        await this.applySubscription(tx, payment.id, payment.specialistId, payment.plan, payment.stars);
      } else if (payment.purpose === 'LISTING_PROMOTION') {
        await this.applyPromotion(tx, payment.listingId, payment.plan);
      } else if (payment.purpose === 'WALLET_TOPUP') {
        const user = await tx.user.update({
          where: { id: payment.userId },
          data: { starsBalance: { increment: payment.stars } },
          select: { starsBalance: true },
        });
        await tx.walletEntry.create({
          data: {
            userId: payment.userId,
            kind: 'TOPUP',
            stars: payment.stars,
            balanceAfter: user.starsBalance,
            title: `Пополнение на ${payment.stars} ★`,
            paymentId: payment.id,
          },
        });
      }
      // LISTING_SLOT выдавать нечего: оплаченное место — это сама запись,
      // и лимит считает её при следующей попытке разместить объявление.
    });

    return { applied: true };
  }

  /** Сколько объявлений человек может разместить прямо сейчас. */
  async listingQuota(userId: string): Promise<{
    freePerMonth: number;
    usedThisMonth: number;
    paidSlots: number;
    left: number;
    extraStars: number;
  }> {
    const since = monthStart();

    const [usedThisMonth, paidSlots] = await Promise.all([
      this.prisma.listing.count({
        where: { userId, kind: 'SELL', createdAt: { gte: since } },
      }),
      this.prisma.payment.count({
        where: { userId, purpose: 'LISTING_SLOT', status: 'PAID', paidAt: { gte: since } },
      }),
    ]);

    return {
      freePerMonth: LISTING_FREE_PER_MONTH,
      usedThisMonth,
      paidSlots,
      left: Math.max(0, LISTING_FREE_PER_MONTH + paidSlots - usedThisMonth),
      extraStars: LISTING_EXTRA_STARS,
    };
  }

  /** История оплат — человек должен видеть, за что с него взяли. */
  async history(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId, status: { in: ['PAID', 'REFUNDED'] } },
      orderBy: { paidAt: 'desc' },
      take: 50,
      select: {
        id: true,
        purpose: true,
        plan: true,
        stars: true,
        status: true,
        paidAt: true,
        listing: { select: { title: true, slug: true } },
      },
    });
  }

  /** Кошелёк: остаток и история движений. */
  async wallet(userId: string): Promise<{
    balance: number;
    entries: {
      id: string;
      kind: string;
      stars: number;
      balanceAfter: number;
      title: string;
      createdAt: string;
    }[];
  }> {
    const [user, entries] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { starsBalance: true } }),
      this.prisma.walletEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, kind: true, stars: true, balanceAfter: true, title: true, createdAt: true },
      }),
    ]);

    return {
      balance: user?.starsBalance ?? 0,
      entries: entries.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    };
  }

  /**
   * Списывает с баланса и выдаёт купленное.
   *
   * Проверка остатка и списание идут одной операцией с условием на сумму:
   * два одновременных запроса иначе оба увидели бы достаточный остаток
   * и оба прошли бы, уведя баланс в минус.
   */
  async payFromBalance(userId: string, dto: CreateInvoiceDto): Promise<{ balance: number }> {
    const order = await this.describeOrder(userId, dto);
    if (dto.purpose === 'WALLET_TOPUP') {
      throw new BadRequestException('Пополнить кошелёк с его же баланса нельзя');
    }

    return this.prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: { id: userId, starsBalance: { gte: order.stars } },
        data: { starsBalance: { decrement: order.stars } },
      });
      if (debited.count === 0) throw new BadRequestException('На балансе недостаточно звёзд');

      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { starsBalance: true },
      });

      const payment = await tx.payment.create({
        data: {
          userId,
          purpose: dto.purpose,
          status: 'PAID',
          paidAt: new Date(),
          stars: order.stars,
          plan: dto.plan ?? null,
          listingId: order.listingId ?? null,
          specialistId: order.specialistId ?? null,
          invoicePayload: `b_${randomUUID().replace(/-/g, '')}`,
        },
        select: { id: true },
      });

      await tx.walletEntry.create({
        data: {
          userId,
          kind: 'SPEND',
          stars: -order.stars,
          balanceAfter: user.starsBalance,
          title: order.title,
          paymentId: payment.id,
        },
      });

      if (dto.purpose === 'SPECIALIST_SUBSCRIPTION') {
        await this.applySubscription(tx, payment.id, order.specialistId ?? null, dto.plan ?? null, order.stars);
      } else if (dto.purpose === 'LISTING_PROMOTION') {
        await this.applyPromotion(tx, order.listingId ?? null, dto.plan ?? null);
      }

      return { balance: user.starsBalance };
    });
  }

  /** Что именно покупают, почём и можно ли это купить. */
  private async describeOrder(userId: string, dto: CreateInvoiceDto) {
    if (dto.purpose === 'WALLET_TOPUP') {
      const stars = dto.stars ?? 0;
      // Сумму проверяем и здесь, а не только в поле ввода: до сервера
      // запрос доходит и без приложения, и тогда единственная защита
      // от «пополнить на миллион за одну звезду» — вот эта строка.
      if (!isTopupAmount(stars)) {
        throw new BadRequestException(
          `Сумма пополнения — от ${TOPUP_MIN_STARS} до ${TOPUP_MAX_STARS} ★ целым числом`,
        );
      }
      return {
        stars,
        title: `Пополнение на ${stars} ★`,
        description: 'Звёзды зачисляются на баланс и тратятся внутри приложения',
        specialistId: undefined as string | undefined,
        listingId: undefined as string | undefined,
      };
    }

    if (dto.purpose === 'SPECIALIST_SUBSCRIPTION') {
      const plan = dto.plan ?? '';
      if (!isSpecialistPlan(plan)) throw new BadRequestException('Неизвестный тариф подписки');

      const specialist = await this.prisma.specialist.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!specialist) throw new BadRequestException('Сначала заполните анкету специалиста');

      const tariff = SPECIALIST_PLANS[plan];
      return {
        stars: tariff.stars,
        title: `Подписка: ${tariff.title.toLowerCase()}`,
        description: 'Анкета показывается в каталоге и на карте, пока действует подписка',
        specialistId: specialist.id,
        listingId: undefined as string | undefined,
      };
    }

    if (dto.purpose === 'LISTING_SLOT') {
      const quota = await this.listingQuota(userId);
      // Платить, когда бесплатные ещё не кончились, незачем: человек
      // отдал бы звёзды за то, что и так доступно.
      if (quota.left > 0) {
        throw new BadRequestException('Бесплатные объявления этого месяца ещё не закончились');
      }
      return {
        stars: LISTING_EXTRA_STARS,
        title: 'Ещё одно объявление',
        description: 'Право разместить объявление сверх бесплатного месячного лимита',
        specialistId: undefined as string | undefined,
        listingId: undefined as string | undefined,
      };
    }

    const plan = dto.plan ?? '';
    if (!isListingPromotion(plan)) throw new BadRequestException('Неизвестный тариф продвижения');

    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: { id: true, userId: true, title: true, status: true },
    });
    if (!listing) throw new NotFoundException('Объявление не найдено');
    if (listing.userId !== userId) throw new ForbiddenException('Это чужое объявление');
    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Продвигать можно только опубликованное объявление');
    }

    const tariff = LISTING_PROMOTIONS[plan];
    return {
      stars: tariff.stars,
      title: tariff.title,
      description: listing.title.slice(0, 200),
      specialistId: undefined as string | undefined,
      listingId: listing.id,
    };
  }

  private async applySubscription(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    paymentId: string,
    specialistId: string | null,
    plan: string | null,
    stars: number,
  ): Promise<void> {
    if (!specialistId || !plan || !isSpecialistPlan(plan)) {
      this.logger.error(`Оплата ${paymentId}: подписка без специалиста или тарифа`);
      return;
    }

    const now = new Date();
    const current = await tx.subscription.findFirst({
      where: { specialistId, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });

    await tx.subscription.create({
      data: {
        specialistId,
        plan,
        startsAt: now,
        endsAt: extendFrom(current?.endsAt, SPECIALIST_PLANS[plan].days, now),
        amount: stars,
        currency: 'XTR',
        note: 'Оплачено звёздами Telegram',
        paymentId,
      },
    });
  }

  private async applyPromotion(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    listingId: string | null,
    plan: string | null,
  ): Promise<void> {
    if (!listingId || !plan || !isListingPromotion(plan)) {
      this.logger.error(`Оплата продвижения без объявления или тарифа`);
      return;
    }

    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      select: { promotedUntil: true },
    });
    if (!listing) return;

    await tx.listing.update({
      where: { id: listingId },
      data: { promotedUntil: extendFrom(listing.promotedUntil, LISTING_PROMOTIONS[plan].days) },
    });
  }
}
