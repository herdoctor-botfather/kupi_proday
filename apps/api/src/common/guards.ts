import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Role } from '@app/shared';
import type { AuthedRequest, RequestUser } from './current-user.decorator';

export interface JwtPayload {
  sub: string;
  tg: string;
  role: Role;
}

function extractToken(req: AuthedRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function toRequestUser(payload: JwtPayload): RequestUser {
  return { id: payload.sub, telegramId: BigInt(payload.tg), role: payload.role };
}

/** Требует валидный JWT. Без него — 401. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException({ code: 'NO_TOKEN', message: 'Требуется авторизация' });

    try {
      req.user = toRequestUser(await this.jwt.verifyAsync<JwtPayload>(token));
      return true;
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Сессия истекла, переоткройте приложение' });
    }
  }
}

/**
 * Разбирает токен, если он есть, но не требует его.
 * Нужен публичным маршрутам, которые подмешивают персональные данные
 * (например, признак «я уже оставил отзыв» в карточке специалиста).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractToken(req);
    if (token) {
      try {
        req.user = toRequestUser(await this.jwt.verifyAsync<JwtPayload>(token));
      } catch {
        // Битый токен в публичном маршруте — просто считаем гостем.
      }
    }
    return true;
  }
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Проверяет роль. Ставится всегда после JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new UnauthorizedException({ code: 'NO_TOKEN', message: 'Требуется авторизация' });
    if (!required.includes(req.user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Недостаточно прав' });
    }
    return true;
  }
}
