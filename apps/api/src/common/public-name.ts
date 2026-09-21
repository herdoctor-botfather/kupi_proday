import { CONTACT_PLACEHOLDER, maskContacts } from '@app/shared';

/**
 * Имя человека, каким его видят другие.
 *
 * Имя приходит из профиля Telegram, и люди нередко вписывают туда
 * @ник, ссылку или номер телефона: «Андрей @evrei152», «Ремонт
 * 89001234567». Показанное как есть, оно уводит общение из площадки в
 * личку — ровно то, от чего нас защищает чат внутри приложения.
 *
 * Поэтому контакты из имени вырезаем, а не заменяем пометкой «контакт
 * скрыт»: в имени она выглядела бы как ошибка. Если после чистки не
 * осталось ничего осмысленного, человек показывается безлико.
 */
export function publicName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return 'Пользователь NADO';

  const { text } = maskContacts(trimmed);
  const cleaned = text.split(CONTACT_PLACEHOLDER).join(' ').replace(/\s+/g, ' ').trim();

  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : 'Пользователь NADO';
}
