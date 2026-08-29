import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Сколько попыток обойти правило считается уже не случайностью.
 * Первая почти всегда от незнания, третья — намерение.
 */
const STAFF_ALERT_THRESHOLD = 3;

/**
 * Реакция на попытки передать контакты в обход правил площадки.
 *
 * Молча вычищать контакты недостаточно: человек не понимает, почему
 * собеседник не отвечает на присланный номер, и повторяет попытку.
 * Первый раз объясняем правило, дальше — показываем администратору,
 * чтобы он решил, что делать с этим специалистом.
 */
@Injectable()
export class ContactPolicyService {
  private readonly logger = new Logger(ContactPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Отмечает попытку и реагирует на неё. Ошибки внутри не должны мешать
   * отправке сообщения — оно уже принято и вычищено.
   */
  register(userId: string, context: 'chat' | 'profile'): void {
    void this.handle(userId, context).catch((error: unknown) => {
      this.logger.warn(`Не удалось обработать попытку обхода ${userId}: ${String(error)}`);
    });
  }

  private async handle(userId: string, context: 'chat' | 'profile'): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { contactAttempts: { increment: 1 } },
      select: { contactAttempts: true, firstName: true, lastName: true, username: true },
    });

    if (user.contactAttempts === 1) {
      this.notifications.notify(
        userId,
        '⚠️ <b>Контакты скрыты</b>\n\n' +
          (context === 'chat'
            ? 'Телефоны и ссылки в сообщениях скрываются автоматически. '
            : 'Телефоны и ссылки в анкете скрываются автоматически. ') +
          'Договаривайтесь в чате приложения: переписка сохраняется, и в спорной ситуации ' +
          'вам будет на что сослаться. Это защищает обе стороны.',
        this.notifications.miniAppUrl,
      );
      return;
    }

    // Сообщаем администрации один раз, на пороге, а не при каждой
    // последующей попытке — иначе один настойчивый человек завалит очередь.
    if (user.contactAttempts === STAFF_ALERT_THRESHOLD) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
      const handle = user.username ? ` (@${user.username})` : '';
      await this.notifications.notifyStaff(
        `🚧 <b>Обход правил площадки</b>\n\n${escapeHtml(name)}${escapeHtml(handle)} ` +
          `уже ${STAFF_ALERT_THRESHOLD} раза пытался передать контакты в обход чата.`,
      );
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
