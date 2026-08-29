import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  moderateReviewSchema,
  moderateListingSchema,
  moderateSpecialistSchema,
  paginationSchema,
  upsertCategorySchema,
  upsertSpecialistSchema,
  upsertSubscriptionSchema,
  type ModerateReviewDto,
  type ModerateListingDto,
  type ModerateSpecialistDto,
  type UpsertCategoryDto,
  type UpsertSpecialistDto,
  type UpsertSubscriptionDto,
} from '@app/shared';
import { z } from 'zod';
import { AdminService } from './admin.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard, Roles, RolesGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

const adminListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['DRAFT', 'PENDING', 'ACTIVE', 'HIDDEN', 'BLOCKED']).optional(),
});
type AdminListQuery = z.infer<typeof adminListQuerySchema>;
type Pagination = z.infer<typeof paginationSchema>;

/**
 * Админ-панель. Модерация отзывов доступна модераторам,
 * всё остальное — только администраторам.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MODERATOR')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  // ─── Отзывы ───

  @Get('reviews/pending')
  pendingReviews(@Query(new ZodValidationPipe(paginationSchema)) query: Pagination) {
    return this.admin.pendingReviews(query.page, query.pageSize);
  }

  @Patch('reviews/:id')
  moderateReview(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderateReviewSchema)) dto: ModerateReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.admin.moderateReview(id, dto, user.id);
  }

  // ─── Заявки специалистов ───

  @Get('applications')
  pendingApplications() {
    return this.admin.pendingApplications();
  }

  @Patch('specialists/:id/moderate')
  moderateSpecialist(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderateSpecialistSchema)) dto: ModerateSpecialistDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.admin.moderateSpecialist(id, dto, user.id);
  }

  // ─── Объявления ───

  @Get('listings/pending')
  pendingListings() {
    return this.admin.pendingListings();
  }

  @Patch('listings/:id/moderate')
  moderateListing(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderateListingSchema)) dto: ModerateListingDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.admin.moderateListing(id, dto, user.id);
  }

  // ─── Специалисты ───

  @Get('specialists')
  @Roles('ADMIN')
  listSpecialists(@Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery) {
    return this.admin.listSpecialists(query);
  }

  @Get('specialists/:id')
  @Roles('ADMIN')
  getSpecialist(@Param('id') id: string) {
    return this.admin.getSpecialist(id);
  }

  @Post('specialists')
  @Roles('ADMIN')
  createSpecialist(
    @Body(new ZodValidationPipe(upsertSpecialistSchema)) dto: UpsertSpecialistDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.admin.createSpecialist(dto, user.id);
  }

  @Put('specialists/:id')
  @Roles('ADMIN')
  updateSpecialist(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertSpecialistSchema)) dto: UpsertSpecialistDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.admin.updateSpecialist(id, dto, user.id);
  }

  @Delete('specialists/:id')
  @Roles('ADMIN')
  @HttpCode(204)
  deleteSpecialist(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.admin.deleteSpecialist(id, user.id);
  }

  // ─── Категории ───

  @Get('categories')
  @Roles('ADMIN')
  listCategories() {
    return this.admin.listCategories();
  }

  @Post('categories')
  @Roles('ADMIN')
  createCategory(@Body(new ZodValidationPipe(upsertCategorySchema)) dto: UpsertCategoryDto) {
    return this.admin.createCategory(dto);
  }

  @Put('categories/:id')
  @Roles('ADMIN')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertCategorySchema)) dto: UpsertCategoryDto,
  ) {
    return this.admin.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles('ADMIN')
  @HttpCode(204)
  deleteCategory(@Param('id') id: string) {
    return this.admin.deleteCategory(id);
  }

  // ─── Подписки ───

  @Get('specialists/:id/subscriptions')
  @Roles('ADMIN')
  listSubscriptions(@Param('id') id: string) {
    return this.admin.listSubscriptions(id);
  }

  @Post('specialists/:id/subscriptions')
  @Roles('ADMIN')
  addSubscription(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(upsertSubscriptionSchema)) dto: UpsertSubscriptionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.admin.addSubscription(id, dto, user.id);
  }

  @Post('subscriptions/expire')
  @Roles('ADMIN')
  expireSubscriptions() {
    return this.admin.expireSubscriptions();
  }
}
