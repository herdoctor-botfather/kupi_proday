import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { config } from '../config';

/**
 * Уведомления пользователям через бота.
 *
 * Главное преимущество Mini App перед сайтом: у приложения уже есть канал
 * связи с каждым, кто его открывал. Без уведомлений петля обратной связи
 * рвётся — специалист не узнаёт о решении по анкете, автор отзыва не знает,
 * опубликовали ли его, а администратор не видит новых заявок, пока сам
 * не откроет панель.
 *
 * Отправка намеренно не влияет на исход операции: если Telegram недоступен
 * или пользователь заблокировал бота, отзыв всё равно должен быть одобрен,
 * а анкета опубликована. Поэтому ошибки только пишутся в лог.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly apiUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Отправляет сообщение и возвращает управление, не дожидаясь Telegram.
   * Вызывающий код продолжает работу — уведомление это побочный эффект,
   * а не часть транзакции.
   */
  notify(userId: string, text: string, buttonUrl?: string): void {
    if (!config.notificationsEnabled) return;
    void this.send(userId, text, buttonUrl).catch((error: unknown) => {
      this.logger.warn(`Не удалось уведомить ${userId}: ${String(error)}`);
    });
  }

  /** Уведомляет всех администраторов и модераторов. */
  async notifyStaff(text: string, buttonUrl?: string): Promise<void> {
    if (!config.notificationsEnabled) return;
    const staff = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'MODERATOR'] }, botBlocked: false },
      select: { id: true },
    });
    for (const member of staff) this.notify(member.id, text, buttonUrl);
  }

  private async send(userId: string, text: string, buttonUrl?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, botBlocked: true },
    });

    if (!user) return;
    // Заблокировавшему бота слать бессмысленно: Telegram всё равно откажет,
    // а лимит запросов израсходуется.
    if (user.botBlocked) return;

    const response = await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.telegramId.toString(),
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(buttonUrl
          ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: buttonUrl } }]] } }
          : {}),
      }),
    });

    if (response.ok) return;

    const body = (await response.json().catch(() => null)) as { description?: string } | null;

    // 403 — бот заблокирован. 400 «chat not found» — пользователь никогда
    // не начинал с ботом чат. Практически это одно и то же: достучаться
    // нельзя. Запоминаем, чтобы не тратить лимит запросов на каждое событие.
    const unreachable =
      response.status === 403 ||
      (response.status === 400 && /chat not found|user is deactivated/i.test(body?.description ?? ''));

    if (unreachable) {
      await this.prisma.user.update({ where: { id: userId }, data: { botBlocked: true } });
      this.logger.log(`Пользователь ${userId} недоступен для бота, уведомления отключены`);
      return;
    }

    this.logger.warn(`Telegram отказал (${response.status}): ${body?.description ?? 'без описания'}`);
  }

  /** Адрес Mini App для кнопки под сообщением. Пустой, если не настроен. */
  get miniAppUrl(): string | undefined {
    return config.MINIAPP_URL || undefined;
  }
}
