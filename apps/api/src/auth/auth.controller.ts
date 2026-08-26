import { Body, Controller, Get, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import {
  authSchema,
  onboardingSchema,
  type AuthDto,
  type AuthResponse,
  type CurrentUser as CurrentUserDto,
  type OnboardingDto,
} from '@app/shared';
import { z } from 'zod';
import { AuthService, toCurrentUser } from './auth.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const devLoginSchema = z.object({ token: z.string().min(1) });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /** Вызывается Mini App один раз при запуске. */
  @Post('telegram')
  @UsePipes(new ZodValidationPipe(authSchema))
  telegram(@Body() dto: AuthDto): Promise<AuthResponse> {
    return this.auth.loginWithInitData(dto.initData);
  }

  /** Вход в веб-админку через Telegram Login Widget. */
  @Post('telegram-login')
  telegramLogin(@Body() payload: Record<string, unknown>): Promise<AuthResponse> {
    // Схему не навязываем: состав полей у виджета меняется, а лишние поля
    // всё равно участвуют в проверке подписи — отбросив их, мы бы её сломали.
    return this.auth.loginWithWidget(payload);
  }

  /** Локальная разработка админки без публичного HTTPS-домена. */
  @Post('dev')
  @UsePipes(new ZodValidationPipe(devLoginSchema))
  dev(@Body() dto: { token: string }): Promise<AuthResponse> {
    return this.auth.loginWithDevToken(dto.token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() current: RequestUser): Promise<CurrentUserDto> {
    const [user, specialist] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: current.id } }),
      this.prisma.specialist.findUnique({ where: { userId: current.id }, select: { id: true } }),
    ]);
    return toCurrentUser(user, Boolean(specialist));
  }

  /** Сохраняет выбор со стартового экрана: искать специалистов или стать одним из них. */
  @Patch('onboarding')
  @UseGuards(JwtAuthGuard)
  async setOnboarding(
    // Пайп вешаем на тело, а не на метод: @UsePipes применяется ко всем
    // параметрам сразу, и валидацию не прошёл бы @CurrentUser.
    @Body(new ZodValidationPipe(onboardingSchema)) dto: OnboardingDto,
    @CurrentUser() current: RequestUser,
  ): Promise<CurrentUserDto> {
    const user = await this.prisma.user.update({
      where: { id: current.id },
      data: { onboardedAs: dto.role },
    });
    const specialist = await this.prisma.specialist.findUnique({
      where: { userId: current.id },
      select: { id: true },
    });
    return toCurrentUser(user, Boolean(specialist));
  }
}
