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
  IMAGE_GENERATION_STARS,
  CASHBACK_PERCENT,
  WELCOME_BONUS_STARS,
  isTopupAmount,
  isLaunchFree,
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
        data: {
          status: 'PAID',
          paidAt: new Date(),
          // Пустой номер списания пишем как отсутствие: в базе он
          // уникален, и пустые строки столкнулись бы между собой.
          telegramChargeId: dto.telegramChargeId || null,
        },
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

      await this.addCashback(tx, payment.userId, payment.purpose, payment.stars);
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
    launchFree: boolean;
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

    // В бесплатный период лимита нет вовсе — но счётчик размещённого
    // продолжаем вести: по нему будет видно, что происходит, когда
    // цены вернутся.
    const launchFree = isLaunchFree();

    return {
      freePerMonth: LISTING_FREE_PER_MONTH,
      usedThisMonth,
      paidSlots,
      left: launchFree
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, LISTING_FREE_PER_MONTH + paidSlots - usedThisMonth),
      extraStars: LISTING_EXTRA_STARS,
      launchFree,
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
  /**
   * Счёт ровно на то, чего не хватает для покупки.
   *
   * Раньше платные возможности брались только с внутреннего счёта, а
   * пополнить его можно было от пятидесяти звёзд. Человек, желавший
   * картинку за десять, упирался в «сначала пополните кошелёк на
   * полсотни» — и уходил. Теперь он платит ровно за то, что берёт, а
   * кошелёк остаётся для тех, кому удобно держать запас.
   *
   * Деньги всё равно проходят через счёт: оплата зачисляется на него,
   * и покупка тут же списывается. Так бухгалтерия остаётся одна на
   * все случаи, а человек видит привычное «оплатил — получил».
   */
  async invoiceForPurchase(
    userId: string,
    dto: CreateInvoiceDto,
  ): Promise<{ url: string; stars: number }> {
    if (dto.purpose === 'WALLET_TOPUP') {
      throw new BadRequestException('Для пополнения есть обычный счёт');
    }

    const order = await this.describeOrder(userId, dto);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { starsBalance: true },
    });

    // Просим недостающее, а не полную цену: у кого на счету что-то
    // есть, тот доплачивает разницу.
    const missing = Math.max(1, order.stars - user.starsBalance);
    const payload = `p_${randomUUID().replace(/-/g, '')}`;

    await this.prisma.payment.create({
      data: {
        userId,
        // Назначение — пополнение: покупка спишется отдельной записью
        // сразу после зачисления, и в истории будет видно обе стороны.
        purpose: 'WALLET_TOPUP',
        stars: missing,
        invoicePayload: payload,
      },
      select: { id: true },
    });

    const url = await this.stars.createInvoiceLink({
      title: order.title,
      description: order.description,
      payload,
      stars: missing,
    });

    return { url, stars: missing };
  }

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
      if (debited.count === 0) {
        // Код нужен приложению: по нему оно предлагает оплатить
        // недостающее сразу, вместо того чтобы гнать человека
        // пополнять кошелёк отдельным заходом.
        throw new BadRequestException({
          code: 'NO_FUNDS',
          message: 'На балансе недостаточно звёзд',
        });
      }

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

      await this.addCashback(tx, userId, dto.purpose, order.stars);

      // Баланс перечитываем: кэшбек мог его поднять уже после списания,
      // и показать человеку число до начисления значило бы соврать.
      const after = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { starsBalance: true },
      });

      return { balance: after.starsBalance };
    });
  }

  /**
   * Вернуть звёзды на баланс.
   *
   * Нужен там, где между оплатой и выдачей стоит чужая служба: списали,
   * а она не ответила. Брать деньги за несделанное нельзя, и решать это
   * перепиской с поддержкой — тоже: возврат должен случаться сам, в той
   * же секунде, что и отказ.
   */
  async refundToBalance(userId: string, stars: number, title: string): Promise<void> {
    if (stars <= 0) return;

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { starsBalance: { increment: stars } },
        select: { starsBalance: true },
      });

      await tx.walletEntry.create({
        data: {
          userId,
          kind: 'REFUND',
          stars,
          balanceAfter: user.starsBalance,
          title,
        },
      });
    });
  }

  /**
   * Кэшбек с покупки.
   *
   * Начисляется в той же транзакции, что и сама покупка: если платёж
   * откатится, подарок не должен остаться. Пополнение кошелька покупкой
   * не считается — иначе звёзды делали бы звёзды из воздуха.
   */
  private async addCashback(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    userId: string,
    purpose: string,
    stars: number,
  ): Promise<void> {
    if (purpose === 'WALLET_TOPUP') return;

    // Округление вниз: с мелкой покупки кэшбека нет вовсе, и обещать его
    // строкой «0 ★» в истории кошелька незачем.
    const bonus = Math.floor((stars * CASHBACK_PERCENT) / 100);
    if (bonus <= 0) return;

    const user = await tx.user.update({
      where: { id: userId },
      data: { starsBalance: { increment: bonus } },
      select: { starsBalance: true },
    });

    await tx.walletEntry.create({
      data: {
        userId,
        kind: 'BONUS',
        stars: bonus,
        balanceAfter: user.starsBalance,
        title: `Кэшбек ${CASHBACK_PERCENT}% с покупки`,
        /*
         * Ссылку на платёж здесь не ставим.
         *
         * Она уникальна и уже занята записью о самом списании: на один
         * платёж приходится две строки — «потратил» и «вернулось». Попытка
         * сослаться дважды роняла всю покупку, и человек с деньгами на
         * счету видел «Internal server error» вместо картинки.
         *
         * Связь с покупкой читается по времени и названию, а уникальность
         * оставлена пополнениям, где она и нужна.
         */
      },
    });
  }

  /**
   * Приветственные звёзды за первое дело.
   *
   * Разовость обеспечивает условие в самом обновлении: две одновременные
   * попытки не дадут двух подарков, потому что вторая не найдёт строки
   * с пустой отметкой.
   */
  async grantWelcomeBonus(userId: string, reason: string): Promise<void> {
    await this.prisma
      .$transaction(async (tx) => {
        const claimed = await tx.user.updateMany({
          where: { id: userId, welcomeBonusAt: null },
          data: { welcomeBonusAt: new Date(), starsBalance: { increment: WELCOME_BONUS_STARS } },
        });
        if (claimed.count === 0) return;

        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { starsBalance: true },
        });

        await tx.walletEntry.create({
          data: {
            userId,
            kind: 'BONUS',
            stars: WELCOME_BONUS_STARS,
            balanceAfter: user.starsBalance,
            title: reason,
          },
        });
      })
      // Подарок — приятная мелочь, а не часть размещения: если он
      // не начислился, объявление всё равно должно выйти.
      .catch((error: unknown) => {
        this.logger.warn(`Не удалось начислить приветственные звёзды ${userId}: ${String(error)}`);
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

    if (dto.purpose === 'IMAGE_GENERATION') {
      return {
        stars: IMAGE_GENERATION_STARS,
        title: 'Рисованная картинка',
        description: 'Изображение по описанию для анкеты или запроса',
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

    /*
     * Срок показа живёт на самой анкете — по нему её пускает каталог.
     *
     * Раньше оплата только записывала подписку в историю, а срок на
     * анкете не трогала: заплативший мастер в ленту не попадал. И
     * отсчитывала неделю от сегодня, не видя показа, выданного
     * администрацией, — купленное поверх подарка просто сгорало.
     * Теперь оплаченное встаёт в хвост к уже действующему сроку, откуда
     * бы тот ни взялся.
     */
    const now = new Date();
    const specialist = await tx.specialist.findUnique({
      where: { id: specialistId },
      select: { subscriptionUntil: true },
    });
    const current = specialist?.subscriptionUntil;
    const startsAt = current && current > now ? current : now;
    const endsAt = extendFrom(current, SPECIALIST_PLANS[plan].days, now);

    await tx.specialist.update({
      where: { id: specialistId },
      data: { subscriptionUntil: endsAt, isPromoted: true },
    });

    await tx.subscription.create({
      data: {
        specialistId,
        plan,
        startsAt,
        endsAt,
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
