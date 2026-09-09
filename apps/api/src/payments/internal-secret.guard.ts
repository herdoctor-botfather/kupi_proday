import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from '../config';

/**
 * Пропускает только обращения нашего же бота.
 *
 * Об оплате Telegram сообщает боту, а выдаёт купленное сервер — между ними
 * нужен канал, которому можно верить. Пока ключ не задан, дверь закрыта
 * совсем: принимать подтверждения оплаты от кого угодно опаснее, чем
 * не принимать их вовсе.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = config.INTERNAL_API_SECRET;
    if (!secret) throw new UnauthorizedException('Внутренний ключ не настроен');

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header('x-internal-secret') ?? '';

    // Сравнение постоянного времени: обычное «===» выходит из цикла на
    // первом несовпавшем байте и тем самым подсказывает, сколько символов
    // угадано верно.
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Неверный внутренний ключ');
    }

    return true;
  }
}
