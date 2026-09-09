import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { createInvoiceSchema, type CreateInvoiceDto } from '@app/shared';
import { InternalService, type CabinetSummary } from './internal.service';
import { InternalSecretGuard } from '../payments/internal-secret.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

/**
 * Служебные обращения бота.
 *
 * Все запросы приходят от нашего же бота и закрыты общим ключом. Человека
 * определяем по идентификатору Telegram: бот получает его от Telegram
 * вместе с сообщением, подменить его снаружи нельзя, а токена приложения
 * у бота нет и быть не должно.
 *
 * Отдельно от остальных контроллеров намеренно: здесь другая модель
 * доверия, и смешивать её с обычными, где решает JWT пользователя,
 * значит однажды случайно открыть чужие данные.
 */
@Controller('internal')
@UseGuards(InternalSecretGuard)
export class InternalController {
  constructor(private readonly internal: InternalService) {}

  @Post('cabinet')
  @HttpCode(200)
  summary(@Body() body: { telegramId?: string }): Promise<CabinetSummary> {
    return this.internal.summary(String(body?.telegramId ?? ''));
  }

  @Post('cabinet/profile-visibility')
  @HttpCode(200)
  setProfileVisibility(
    @Body() body: { telegramId?: string; action?: 'hide' | 'publish' },
  ): Promise<CabinetSummary> {
    return this.internal.setProfileVisibility(
      String(body?.telegramId ?? ''),
      body?.action === 'hide' ? 'hide' : 'publish',
    );
  }

  @Post('invoice')
  @HttpCode(200)
  invoice(
    @Body('telegramId') telegramId: string,
    @Body(new ZodValidationPipe(createInvoiceSchema)) dto: CreateInvoiceDto,
  ): Promise<{ url: string }> {
    return this.internal.invoice(String(telegramId ?? ''), dto);
  }

  @Post('pay-from-balance')
  @HttpCode(200)
  payFromBalance(
    @Body('telegramId') telegramId: string,
    @Body(new ZodValidationPipe(createInvoiceSchema)) dto: CreateInvoiceDto,
  ): Promise<{ balance: number }> {
    return this.internal.payFromBalance(String(telegramId ?? ''), dto);
  }
}
