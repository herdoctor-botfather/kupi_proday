import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createReportSchema,
  resolveReportSchema,
  type CreateReportDto,
  type ResolveReportDto,
} from '@app/shared';
import { ReportsService } from './reports.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Пожаловаться может любой авторизованный пользователь. */
  @Post('reports')
  @UseGuards(JwtAuthGuard)
  create(
    @Body(new ZodValidationPipe(createReportSchema)) dto: CreateReportDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reports.create(user.id, dto);
  }

  @Get('admin/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MODERATOR')
  findOpen() {
    return this.reports.findOpen();
  }

  @Patch('admin/reports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MODERATOR')
  resolve(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveReportSchema)) dto: ResolveReportDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reports.resolve(id, dto, user.id);
  }
}
