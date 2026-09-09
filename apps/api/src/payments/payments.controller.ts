import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  confirmPaymentSchema,
  createInvoiceSchema,
  type ConfirmPaymentDto,
  type CreateInvoiceDto,
} from '@app/shared';
import { PaymentsService } from './payments.service';
import { InternalSecretGuard } from './internal-secret.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Счёт на оплату звёздами. Возвращает ссылку для openInvoice. */
  @Post('invoice')
  @UseGuards(JwtAuthGuard)
  createInvoice(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createInvoiceSchema)) dto: CreateInvoiceDto,
  ): Promise<{ url: string; paymentId: string }> {
    return this.payments.createInvoice(user.id, dto);
  }

  /** Сколько объявлений осталось разместить в этом месяце. */
  @Get('listing-quota')
  @UseGuards(JwtAuthGuard)
  listingQuota(@CurrentUser() user: RequestUser) {
    return this.payments.listingQuota(user.id);
  }

  /** История оплат — человек должен видеть, за что с него взяли. */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  history(@CurrentUser() user: RequestUser) {
    return this.payments.history(user.id);
  }

  /** Кошелёк: остаток и движения. */
  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  wallet(@CurrentUser() user: RequestUser) {
    return this.payments.wallet(user.id);
  }

  /** Покупка за звёзды, уже лежащие на балансе. */
  @Post('pay-from-balance')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  payFromBalance(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createInvoiceSchema)) dto: CreateInvoiceDto,
  ): Promise<{ balance: number }> {
    return this.payments.payFromBalance(user.id, dto);
  }

  /**
   * Проверка счёта перед списанием. Бот спрашивает это на pre_checkout_query,
   * и ответить нужно за десять секунд — молчание Telegram считает отказом.
   */
  @Post('awaiting')
  @HttpCode(200)
  @UseGuards(InternalSecretGuard)
  async awaiting(@Body() body: { invoicePayload?: string }): Promise<{ ok: boolean }> {
    return { ok: await this.payments.isAwaitingPayment(body?.invoicePayload ?? '') };
  }

  /** Подтверждение оплаты от бота. */
  @Post('confirm')
  @HttpCode(200)
  @UseGuards(InternalSecretGuard)
  confirm(
    @Body(new ZodValidationPipe(confirmPaymentSchema)) dto: ConfirmPaymentDto,
  ): Promise<{ applied: boolean }> {
    return this.payments.confirm(dto);
  }
}
