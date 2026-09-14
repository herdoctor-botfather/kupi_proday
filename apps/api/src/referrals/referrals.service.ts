import { Injectable, Logger } from '@nestjs/common';
import type { ReferralSummary } from '@app/shared';
import { REFERRAL_MAX, REFERRAL_MILESTONES } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { config } from '../config';

/**
 * Приглашения.
 *
 * Считаем не переходы по ссылке, а людей, которые на площадке что-то
 * сделали: выложили объявление или подали анкету. Приведённый зритель
 * ничего не стоит, а приведённый продавец — то, ради чего всё и затеяно.
 *
 * Подарки вручает человек, а не счётчик: Telegram Premium стоит настоящих
 * денег, и двадцать свежих аккаунтов с объявлениями «продам ничего» не
 * должны превращаться в подписку сами собой. Достигнутый рубеж — это
 * повод администратору посмотреть, кого именно привели.
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Запомнить, кто кого привёл.
   *
   * Вызывается при входе, когда в параметре запуска пришёл чужой код.
   * Записывается один раз и только новому человеку: приглашение бывает
   * однажды, и переписать его задним числом нельзя — иначе ссылку можно
   * было бы «перехватить», отправив её тому, кто уже здесь.
   */
  async remember(userId: string, code: string): Promise<void> {
    const referrerId = code.trim();
    if (!referrerId || referrerId === userId) return;

    const referrer = await this.prisma.user.findUnique({
      where: { id: referrerId },
      select: { id: true, isBlocked: true },
    });
    if (!referrer || referrer.isBlocked) return;

    await this.prisma.user
      .updateMany({
        // Условие в самом обновлении: приглашение записывается только
        // тому, у кого его ещё нет.
        where: { id: userId, referrerId: null },
        data: { referrerId },
      })
      .catch((error: unknown) => {
        this.logger.warn(`Не удалось записать приглашение ${userId}: ${String(error)}`);
      });
  }

  /**
   * Приглашённый сделал первое дело — с этого момента он в зачёте.
   *
   * Вызывается оттуда же, откуда выдаётся приветственный подарок: повод
   * один и тот же — человек перестал быть зрителем.
   */
  async qualify(userId: string): Promise<void> {
    try {
      const claimed = await this.prisma.user.updateMany({
        where: { id: userId, referralQualifiedAt: null, referrerId: { not: null } },
        data: { referralQualifiedAt: new Date() },
      });
      if (claimed.count === 0) return;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { referrerId: true },
      });
      if (user?.referrerId) await this.checkMilestones(user.referrerId);
    } catch (error) {
      // Зачёт приглашения — не часть размещения объявления: если он
      // не прошёл, объявление всё равно должно выйти.
      this.logger.warn(`Не удалось засчитать приглашение ${userId}: ${String(error)}`);
    }
  }

  /** Что человек видит в разделе приглашений. */
  async summary(userId: string): Promise<ReferralSummary> {
    const [invited, qualified, awards] = await Promise.all([
      this.prisma.user.count({ where: { referrerId: userId } }),
      this.prisma.user.count({ where: { referrerId: userId, referralQualifiedAt: { not: null } } }),
      this.prisma.referralAward.findMany({
        where: { userId },
        select: { milestone: true, grantedAt: true },
      }),
    ]);

    const granted = new Map(awards.map((award) => [award.milestone, award.grantedAt]));

    const milestones = REFERRAL_MILESTONES.map((step) => ({
      invited: step.invited,
      title: step.title,
      reached: qualified >= step.invited,
      granted: Boolean(granted.get(step.invited)),
    }));

    const next = REFERRAL_MILESTONES.find((step) => qualified < step.invited);

    return {
      link: this.linkFor(userId),
      invited,
      qualified,
      milestones,
      // Дойдя до последнего рубежа, человек акцию прошёл: дальше считать
      // незачем, и обещать больше мы не готовы.
      toNext: next ? next.invited - qualified : null,
    };
  }

  /** Ссылка-приглашение: обычный deep link в бота. */
  private linkFor(userId: string): string {
    const bot = config.TELEGRAM_BOT_USERNAME || 'bot';
    return `https://t.me/${bot}?start=ref_${userId}`;
  }

  /**
   * Не добрал ли пригласивший очередной рубеж.
   *
   * Запись о награде создаётся один раз — за это отвечает уникальность
   * пары «человек и рубеж» в базе, а не проверка перед вставкой: две
   * одновременные регистрации иначе дали бы две награды.
   */
  private async checkMilestones(referrerId: string): Promise<void> {
    const qualified = await this.prisma.user.count({
      where: { referrerId, referralQualifiedAt: { not: null } },
    });

    const reached = REFERRAL_MILESTONES.filter((step) => qualified >= step.invited);
    if (reached.length === 0) return;

    for (const step of reached) {
      try {
        await this.prisma.referralAward.create({
          data: { userId: referrerId, milestone: step.invited },
        });
      } catch {
        // Уже отмечен — значит, про этот рубеж администратор уже знает.
        continue;
      }

      this.notifications.notify(
        referrerId,
        `🎁 <b>Вы добрали ${step.invited} приглашённых</b>\n\n` +
          `Подарок: ${step.title}. Мы свяжемся с вами, чтобы его вручить.` +
          (step.invited === REFERRAL_MAX ? '\n\nЭто последний рубеж акции — спасибо!' : ''),
        this.notifications.miniAppUrl,
      );

      void this.notifications.notifyStaff(
        `🎁 <b>Рубеж приглашений</b>\n\nПользователь ${referrerId} привёл ${qualified} человек. ` +
          `Положен подарок: ${step.title}.`,
      );
    }
  }
}
