import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { demandWatchSchema, type DemandWatchDto } from '@app/shared';
import { DemandService } from './demand.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/** Подписки на чужой спрос: что мне сообщать, когда кто-то ищет. */
@Controller('demand')
@UseGuards(JwtAuthGuard)
export class DemandController {
  constructor(private readonly demand: DemandService) {}

  @Get('watches')
  list(@CurrentUser() user: RequestUser) {
    return this.demand.list(user.id);
  }

  @Post('watches')
  @HttpCode(200)
  add(
    @Body(new ZodValidationPipe(demandWatchSchema)) dto: DemandWatchDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.demand.add(user.id, dto);
  }

  @Delete('watches/:id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.demand.remove(user.id, id);
  }
}
