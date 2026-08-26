import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { createReviewSchema, paginationSchema, type CreateReviewDto, type Paginated, type Review } from '@app/shared';
import { ReviewsService } from './reviews.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';
import { z } from 'zod';

type Pagination = z.infer<typeof paginationSchema>;

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('specialists/:id/reviews')
  findForSpecialist(
    @Param('id') specialistId: string,
    @Query(new ZodValidationPipe(paginationSchema)) query: Pagination,
  ): Promise<Paginated<Review>> {
    return this.reviews.findForSpecialist(specialistId, query.page, query.pageSize);
  }

  @Post('specialists/:id/reviews')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('id') specialistId: string,
    @Body(new ZodValidationPipe(createReviewSchema)) dto: CreateReviewDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Review> {
    return this.reviews.upsertOwn(specialistId, user.id, dto);
  }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  remove(@Param('id') reviewId: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.reviews.deleteOwn(reviewId, user.id);
  }
}
