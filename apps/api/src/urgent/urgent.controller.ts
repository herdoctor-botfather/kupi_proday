import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { urgentRequestSchema, type UrgentRequestDto } from '@app/shared';
import { UrgentService } from './urgent.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/** Срочные вызовы мастера. */
@Controller('urgent')
@UseGuards(JwtAuthGuard)
export class UrgentController {
  constructor(private readonly urgent: UrgentService) {}

  @Post()
  @HttpCode(200)
  create(
    @Body(new ZodValidationPipe(urgentRequestSchema)) dto: UrgentRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.urgent.create(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: RequestUser) {
    return this.urgent.mine(user.id);
  }

  /** Вызовы для мастера — стоит выше ':id', иначе «incoming» приняли бы за идентификатор. */
  @Get('incoming')
  incoming(@CurrentUser() user: RequestUser) {
    return this.urgent.incoming(user.id);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.urgent.detail(user.id, id);
  }

  @Post(':id/take')
  @HttpCode(200)
  take(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.urgent.take(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.urgent.cancel(user.id, id);
  }
}
