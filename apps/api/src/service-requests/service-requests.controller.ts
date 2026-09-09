import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { serviceRequestSchema, type ServiceRequestDto } from '@app/shared';
import { ServiceRequestsService } from './service-requests.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/** Заявки на услугу: заказчик просит, мастер соглашается. */
@Controller('service-requests')
@UseGuards(JwtAuthGuard)
export class ServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}

  @Post()
  @HttpCode(200)
  create(
    @Body(new ZodValidationPipe(serviceRequestSchema)) dto: ServiceRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.requests.create(user.id, dto.specialistId, dto.note ?? null);
  }

  /** Что сейчас с моей заявкой к этому мастеру. */
  @Get('for/:specialistId')
  current(@Param('specialistId') specialistId: string, @CurrentUser() user: RequestUser) {
    return this.requests.current(user.id, specialistId);
  }

  /** Заявки, которые ждут моего ответа как мастера. */
  @Get('incoming')
  incoming(@CurrentUser() user: RequestUser) {
    return this.requests.incoming(user.id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.requests.respond(user.id, id, 'accept');
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.requests.respond(user.id, id, 'decline');
  }
}
