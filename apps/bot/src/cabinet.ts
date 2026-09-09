import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import type { CallbackQueryContext, Context } from 'grammy';
import { config } from './config';

/**
 * Постоянная кнопка над полем ввода.
 *
 * Команду /cabinet надо помнить и набирать, а кнопка просто есть.
 * Одна, а не набор: всё остальное живёт в приложении, и дублировать
 * его здесь значило бы строить второй интерфейс поверх первого.
 */
export const CABINET_BUTTON = '👤 Личный кабинет';

export const cabinetKeyboard = () => new Keyboard().text(CABINET_BUTTON).resized().persistent();

/**
 * Личный кабинет прямо в переписке с ботом.
 *
 * Зачем он, если всё это есть в приложении: приложение нужно открыть,
 * дождаться загрузки и найти нужный экран. Чтобы посмотреть, сколько
 * осталось подписки, или снять анкету на время отпуска, это слишком
 * долгий путь. Кабинет отвечает на такие вопросы в одном сообщении,
 * и оно обновляется на месте, а не плодит новые.
 *
 * Логики здесь нет намеренно: бот спрашивает готовые числа у сервера
 * и рисует кнопки. Правила — чей это профиль, можно ли его скрыть,
 * хватает ли звёзд — живут в одном месте, на сервере.
 */

interface Cabinet {
  name: string;
  balance: number;
  specialist: {
    status: string;
    title: string;
    subscriptionEndsAt: string | null;
    viewCount: number;
  } | null;
  listings: { active: number; pending: number; hidden: number; sold: number };
  wanted: number;
  unreadChats: number;
  quota: { left: number; freePerMonth: number; extraStars: number };
}

const headers = () => ({
  'Content-Type': 'application/json',
  'x-internal-secret': config.INTERNAL_API_SECRET,
});

async function ask<T>(path: string, body: unknown): Promise<T | { error: string }> {
  if (!config.INTERNAL_API_SECRET) return { error: 'Кабинет не настроен' };

  try {
    const response = await fetch(`${config.API_PROXY_TARGET}/api/internal${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return (await response.json()) as T;

    // Сервер объясняет отказ человеческим текстом — передаём его как есть,
    // вместо «ошибка 400», из которой ничего не следует.
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return { error: payload?.message ?? 'Не получилось. Попробуйте позже.' };
  } catch {
    return { error: 'Сервер не отвечает. Попробуйте через минуту.' };
  }
}

const isError = <T>(value: T | { error: string }): value is { error: string } =>
  typeof value === 'object' && value !== null && 'error' in value;

const STATUS_TEXT: Record<string, string> = {
  DRAFT: 'черновик',
  PENDING: 'на проверке',
  ACTIVE: 'в каталоге',
  HIDDEN: 'скрыта вами',
  REJECTED: 'отклонена',
  BLOCKED: 'заблокирована',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function render(cabinet: Cabinet): { text: string; keyboard: InlineKeyboard } {
  const lines: string[] = [`<b>Личный кабинет</b>`, ''];

  lines.push(`💫 Баланс: <b>${cabinet.balance} ★</b>`);

  if (cabinet.specialist) {
    const s = cabinet.specialist;
    lines.push('', `🔧 <b>Анкета:</b> ${STATUS_TEXT[s.status] ?? s.status}`);
    lines.push(
      s.subscriptionEndsAt
        ? `Показ оплачен до ${formatDate(s.subscriptionEndsAt)}`
        : 'Показ не оплачен',
    );
    if (s.viewCount > 0) lines.push(`Просмотров: ${s.viewCount}`);
  } else {
    lines.push('', '🔧 <b>Анкеты нет.</b> Разместите — и вас начнут находить те, кому надо.');
  }

  const l = cabinet.listings;
  lines.push('', '🛍 <b>Объявления</b>');
  lines.push(
    l.active + l.pending + l.hidden + l.sold === 0
      ? 'Пока ни одного'
      : `На витрине ${l.active} · на проверке ${l.pending} · скрыто ${l.hidden} · продано ${l.sold}`,
  );
  lines.push(
    cabinet.quota.left > 0
      ? `Бесплатных в этом месяце осталось: ${cabinet.quota.left} из ${cabinet.quota.freePerMonth}`
      : `Бесплатные кончились, следующее — ${cabinet.quota.extraStars} ★`,
  );

  if (cabinet.wanted > 0) lines.push('', `🔍 Ваших запросов: ${cabinet.wanted}`);
  if (cabinet.unreadChats > 0) lines.push('', `💬 Непрочитанных сообщений: <b>${cabinet.unreadChats}</b>`);

  const keyboard = new InlineKeyboard();

  keyboard.text('Пополнить кошелёк', 'cab:topup').row();

  if (cabinet.specialist) {
    const active = cabinet.specialist.status === 'ACTIVE';
    const hidden = cabinet.specialist.status === 'HIDDEN';
    keyboard.text('Продлить показ анкеты', 'cab:sub').row();
    // Кнопку показываем только там, где действие вообще возможно:
    // анкету на проверке или заблокированную скрывать нечего.
    if (active) keyboard.text('Скрыть анкету из каталога', 'cab:hide').row();
    if (hidden) keyboard.text('Вернуть анкету в каталог', 'cab:show').row();
  }

  keyboard.text('Обновить', 'cab:refresh');

  return { text: lines.join('\n'), keyboard };
}

/** Наборы пополнения — те же, что в приложении. */
const TOPUP = [199, 499, 1000, 2500];

/** Тарифы подписки — те же, что в приложении. */
const PLANS: [string, string, number][] = [
  ['month', 'Месяц', 199],
  ['quarter', 'Три месяца', 499],
  ['year', 'Год', 1490],
];

export function registerCabinet(bot: Bot): void {
  const open = async (telegramId: number) => {
    const data = await ask<Cabinet>('/cabinet', { telegramId: String(telegramId) });
    if (isError(data)) return { text: data.error, keyboard: new InlineKeyboard().text('Обновить', 'cab:refresh') };
    return render(data);
  };

  bot.command('cabinet', async (ctx) => {
    const { text, keyboard } = await open(ctx.from!.id);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  // Нажатие постоянной кнопки приходит обычным сообщением с её текстом.
  // Обработчик стоит здесь, до общей заглушки «вернитесь к кнопкам»,
  // иначе она перехватила бы нажатие.
  bot.hears(CABINET_BUTTON, async (ctx) => {
    const { text, keyboard } = await open(ctx.from!.id);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  /**
   * Открытие новым сообщением — для кнопок под другими сообщениями.
   * Отдельно от «Обновить» потому, что сообщение с картинкой в текст
   * не превращается: попытка отредактировать его молча ничего не даст,
   * и человек решит, что кнопка не работает.
   */
  bot.callbackQuery('cab:open', async (ctx) => {
    const { text, keyboard } = await open(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery('cab:refresh', async (ctx) => {
    const { text, keyboard } = await open(ctx.from.id);
    // Правим то же сообщение, а не шлём новое: кабинет — это состояние,
    // а не лента событий, и десять его копий в переписке только мешают.
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
    await ctx.answerCallbackQuery();
  });

  for (const [action, visibility] of [
    ['cab:hide', 'hide'],
    ['cab:show', 'publish'],
  ] as const) {
    bot.callbackQuery(action, async (ctx) => {
      const data = await ask<Cabinet>('/cabinet/profile-visibility', {
        telegramId: String(ctx.from.id),
        action: visibility,
      });

      if (isError(data)) {
        await ctx.answerCallbackQuery({ text: data.error, show_alert: true });
        return;
      }

      const { text, keyboard } = render(data);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
      await ctx.answerCallbackQuery({ text: visibility === 'hide' ? 'Анкета скрыта' : 'Анкета в каталоге' });
    });
  }

  bot.callbackQuery('cab:topup', async (ctx) => {
    const keyboard = new InlineKeyboard();
    for (const stars of TOPUP) keyboard.text(`${stars} ★`, `cab:topup:${stars}`).row();
    keyboard.text('Назад', 'cab:refresh');
    await ctx.editMessageText('Насколько пополнить кошелёк?', { reply_markup: keyboard }).catch(() => {});
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('cab:sub', async (ctx) => {
    const keyboard = new InlineKeyboard();
    for (const [id, title, stars] of PLANS) keyboard.text(`${title} — ${stars} ★`, `cab:sub:${id}`).row();
    keyboard.text('Назад', 'cab:refresh');
    await ctx.editMessageText('На какой срок продлить показ анкеты?', { reply_markup: keyboard }).catch(() => {});
    await ctx.answerCallbackQuery();
  });

  // Оплата: сначала пробуем списать с баланса — если звёзд хватает,
  // счёт человеку показывать незачем, он уже заплатил однажды.
  bot.callbackQuery(/^cab:sub:(month|quarter|year)$/, async (ctx) => {
    const plan = ctx.match[1];
    await buy(ctx, { purpose: 'SPECIALIST_SUBSCRIPTION', plan }, 'Подписка продлена');
  });

  bot.callbackQuery(/^cab:topup:(\d+)$/, async (ctx) => {
    const stars = Number(ctx.match[1]);
    // Пополнение с баланса бессмысленно, поэтому сразу счёт.
    const link = await ask<{ url: string }>('/invoice', {
      telegramId: String(ctx.from.id),
      purpose: 'WALLET_TOPUP',
      stars,
    });

    if (isError(link)) {
      await ctx.answerCallbackQuery({ text: link.error, show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    // «В кабинет» рядом с «Оплатить»: передумать — обычное дело, и выход
    // из счёта не должен требовать набирать команду заново.
    await ctx.reply(`Счёт на ${stars} ★`, {
      reply_markup: new InlineKeyboard().url('Оплатить', link.url).row().text('В кабинет', 'cab:open'),
    });
  });

  async function buy(
    ctx: CallbackQueryContext<Context>,
    dto: Record<string, unknown>,
    done: string,
  ): Promise<void> {
    const telegramId = String(ctx.from.id);

    const paid = await ask<{ balance: number }>('/pay-from-balance', { telegramId, ...dto });
    if (!isError(paid)) {
      const { text, keyboard } = await open(ctx.from.id);
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
      await ctx.answerCallbackQuery({ text: `${done}. Остаток: ${paid.balance} ★` });
      return;
    }

    const link = await ask<{ url: string }>('/invoice', { telegramId, ...dto });
    if (isError(link)) {
      await ctx.answerCallbackQuery({ text: link.error, show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.reply('Счёт на оплату', {
      reply_markup: new InlineKeyboard().url('Оплатить', link.url).row().text('В кабинет', 'cab:open'),
    });
  }
}
