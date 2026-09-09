import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateInvoiceDto } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { MySpecialistService } from '../specialists/my-specialist.service';
import { ListingsService } from '../listings/listings.service';

/** Что бот показывает в кабинете. Ровно то, что помещается в одно сообщение. */
export interface CabinetSummary {
  name: string;
  /** Баланс кошелька в звёздах. */
  balance: number;
  specialist: {
    status: 'PENDING' | 'ACTIVE' | 'HIDDEN' | 'BLOCKED' | 'REJECTED' | 'DRAFT';
    title: string;
    subscriptionEndsAt: string | null;
    viewCount: number;
  } | null;
  listings: { active: number; pending: number; hidden: number; sold: number };
  /** Запросы на покупку считаются отдельно: они бесплатны и живут по своим правилам. */
  wanted: number;
  unreadChats: number;
  quota: { left: number; freePerMonth: number; extraStars: number };
}

/**
 * Кабинет в переписке с ботом.
 *
 * Бот не знает ни о базе, ни о правах — он спрашивает у сервера по
 * идентификатору Telegram, который получил от самого Telegram и потому
 * может ему верить. Всё, что здесь есть, — это склейка уже существующих
 * служб: заводить для бота отдельную логику значило бы получить две
 * реализации одних и тех же правил, которые однажды разойдутся.
 */
@Injectable()
export class InternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly specialists: MySpecialistService,
    private readonly listings: ListingsService,
  ) {}

  async summary(telegramId: string): Promise<CabinetSummary> {
    const user = await this.findUser(telegramId);

    const [profile, own, unreadChats, quota, wallet] = await Promise.all([
      this.specialists.findOwn(user.id),
      this.listings.findOwn(user.id),
      this.countUnread(user.id),
      this.payments.listingQuota(user.id),
      this.payments.wallet(user.id),
    ]);

    const sell = own.filter((listing) => listing.kind === 'SELL');

    return {
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      balance: wallet.balance,
      specialist: profile
        ? {
            status: profile.status,
            title: profile.displayName,
            subscriptionEndsAt: profile.subscriptionEndsAt,
            viewCount: profile.viewCount,
          }
        : null,
      listings: {
        active: sell.filter((l) => l.status === 'ACTIVE').length,
        pending: sell.filter((l) => l.status === 'PENDING').length,
        hidden: sell.filter((l) => l.status === 'HIDDEN').length,
        sold: sell.filter((l) => l.status === 'SOLD').length,
      },
      wanted: own.filter((listing) => listing.kind === 'BUY').length,
      unreadChats,
      quota: {
        left: quota.left,
        freePerMonth: quota.freePerMonth,
        extraStars: quota.extraStars,
      },
    };
  }

  /** Снять анкету с публикации или вернуть её обратно. */
  async setProfileVisibility(telegramId: string, action: 'hide' | 'publish'): Promise<CabinetSummary> {
    const user = await this.findUser(telegramId);
    if (action === 'hide') await this.specialists.hide(user.id);
    else await this.specialists.publish(user.id);
    return this.summary(telegramId);
  }

  /** Счёт на оплату для кнопки в боте. */
  async invoice(telegramId: string, dto: CreateInvoiceDto): Promise<{ url: string }> {
    const user = await this.findUser(telegramId);
    const { url } = await this.payments.createInvoice(user.id, dto);
    return { url };
  }

  /** Оплата с баланса — если звёзд хватает, счёт не нужен вовсе. */
  async payFromBalance(telegramId: string, dto: CreateInvoiceDto): Promise<{ balance: number }> {
    const user = await this.findUser(telegramId);
    return this.payments.payFromBalance(user.id, dto);
  }

  private async findUser(telegramId: string) {
    let id: bigint;
    try {
      id = BigInt(telegramId);
    } catch {
      throw new BadRequestException('Некорректный идентификатор Telegram');
    }

    const user = await this.prisma.user.findUnique({
      where: { telegramId: id },
      select: { id: true, firstName: true, lastName: true, isBlocked: true },
    });

    // Незнакомый человек — не ошибка бота: он просто ещё не открывал
    // приложение, и записи о нём нет. Кабинет в этом случае показывать
    // нечего, и бот скажет об этом словами.
    if (!user) throw new NotFoundException({ code: 'NO_ACCOUNT', message: 'Вы ещё не открывали приложение' });
    if (user.isBlocked) throw new BadRequestException({ code: 'BLOCKED', message: 'Доступ ограничен' });

    return user;
  }

  /** Сколько непрочитанных сообщений во всех диалогах человека. */
  private async countUnread(userId: string): Promise<number> {
    return this.prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: userId },
        conversation: {
          // Три стороны, с которых можно оказаться участником разговора:
          // написал сам, отвечаешь как мастер, отвечаешь как продавец.
          OR: [{ clientId: userId }, { specialist: { userId } }, { listing: { userId } }],
        },
      },
    });
  }
}
