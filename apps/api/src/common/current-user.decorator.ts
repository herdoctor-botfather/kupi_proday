import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '@app/shared';

/** Пользователь, восстановленный из JWT. Кладётся в запрос гвардом JwtAuthGuard. */
export interface RequestUser {
  id: string;
  telegramId: bigint;
  role: Role;
}

export type AuthedRequest = Request & { user?: RequestUser };

/**
 * @CurrentUser() user: RequestUser        — в защищённых маршрутах
 * @CurrentUser() user: RequestUser | null — в публичных с OptionalAuthGuard
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthedRequest>();
  return request.user ?? null;
});
