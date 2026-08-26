import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, CurrentUser } from '@app/shared';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { config } from '../config';
import { InitDataError, verifyInitData } from './telegram-init-data';
import { verifyLoginWidget } from './telegram-login-widget';
import type { JwtPayload } from '../common/guards';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Единственный вход в приложение: клиент присылает initData,
   * мы проверяем подпись и заводим или обновляем пользователя.
   */
  async loginWithInitData(initData: string): Promise<AuthResponse> {
    let parsed;
    try {
      parsed = verifyInitData(initData, config.TELEGRAM_BOT_TOKEN);
    } catch (error) {
      if (error instanceof InitDataError) {
        this.logger.warn(`Отклонена авторизация: ${error.message}`);
        throw new UnauthorizedException({ code: 'INVALID_INIT_DATA', message: error.message });
      }
      throw error;
    }

    const tg = parsed.user;
    const telegramId = BigInt(tg.id);

    // Профиль в Telegram мог измениться — обновляем на каждом входе.
    const profile = {
      username: tg.username ?? null,
      firstName: tg.first_name,
      lastName: tg.last_name ?? null,
      photoUrl: tg.photo_url ?? null,
      languageCode: tg.language_code ?? null,
      isPremium: tg.is_premium ?? false,
      lastSeenAt: new Date(),
    };

    const user = await this.prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        ...profile,
        // Первичные администраторы назначаются списком в .env.
        role: config.adminTelegramIds.includes(telegramId) ? 'ADMIN' : 'USER',
      },
      update: profile,
    });

    if (user.isBlocked) {
      throw new UnauthorizedException({ code: 'USER_BLOCKED', message: 'Доступ к приложению закрыт' });
    }

    const specialist = await this.prisma.specialist.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    return { token: await this.issueToken(user), user: toCurrentUser(user, Boolean(specialist)) };
  }

  /**
   * Вход в веб-админку через Telegram Login Widget.
   *
   * Токен выдаётся только сотрудникам: обычному пользователю в админке делать
   * нечего, и отказ на этом шаге понятнее, чем 403 на каждом последующем запросе.
   */
  async loginWithWidget(payload: Record<string, unknown>): Promise<AuthResponse> {
    let tg;
    try {
      tg = verifyLoginWidget(payload, config.TELEGRAM_BOT_TOKEN);
    } catch (error) {
      if (error instanceof InitDataError) {
        this.logger.warn(`Отклонён вход в админку: ${error.message}`);
        throw new UnauthorizedException({ code: 'INVALID_LOGIN_DATA', message: error.message });
      }
      throw error;
    }

    const telegramId = BigInt(tg.id);
    const user = await this.prisma.user.findUnique({ where: { telegramId } });

    if (!user || user.isBlocked) {
      throw new UnauthorizedException({ code: 'NO_ACCESS', message: 'Доступ в админку не разрешён' });
    }
    if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
      throw new UnauthorizedException({ code: 'NOT_STAFF', message: 'Доступ в админку не разрешён' });
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        username: tg.username ?? null,
        firstName: tg.first_name,
        lastName: tg.last_name ?? null,
        photoUrl: tg.photo_url ?? null,
        lastSeenAt: new Date(),
      },
    });

    return { token: await this.issueToken(updated), user: toCurrentUser(updated) };
  }

  /**
   * Вход в админку без Telegram — только для локальной разработки.
   * В production config.adminDevToken всегда пустой, и метод недоступен.
   */
  async loginWithDevToken(token: string): Promise<AuthResponse> {
    if (!config.adminDevToken || token !== config.adminDevToken) {
      throw new UnauthorizedException({ code: 'INVALID_DEV_TOKEN', message: 'Недоступно' });
    }

    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      throw new UnauthorizedException({
        code: 'NO_ADMIN',
        message: 'В базе нет администратора. Укажите ADMIN_TELEGRAM_IDS и выполните npm run db:seed',
      });
    }
    return { token: await this.issueToken(admin), user: toCurrentUser(admin) };
  }

  private issueToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, tg: user.telegramId.toString(), role: user.role };
    return this.jwt.signAsync(payload);
  }
}

export function toCurrentUser(user: User, hasSpecialistProfile = false): CurrentUser {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    role: user.role,
    onboardedAs: user.onboardedAs,
    hasSpecialistProfile,
  };
}
