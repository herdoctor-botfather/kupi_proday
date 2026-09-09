import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { dealReviewSchema, markSoldSchema, type DealReviewDto, type MarkSoldDto } from '@app/shared';
import { DealsService } from './deals.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/** Сделки: отметка продажи и отзывы участников друг о друге. */
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  /** Кому можно отметить продажу — те, кто писал по объявлению. */
  @Get('candidates/:listingId')
  @UseGuards(JwtAuthGuard)
  candidates(@Param('listingId') listingId: string, @CurrentUser() user: RequestUser) {
    return this.deals.buyerCandidates(user.id, listingId);
  }

  @Post('sold/:listingId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  markSold(
    @Param('listingId') listingId: string,
    @Body(new ZodValidationPipe(markSoldSchema)) dto: MarkSoldDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.deals.markSold(user.id, listingId, dto.buyerId ?? null);
  }

  /** Сделки, по которым человек ещё не высказался. */
  @Get('pending')
  @UseGuards(JwtAuthGuard)
  pending(@CurrentUser() user: RequestUser) {
    return this.deals.pendingReviews(user.id);
  }

  @Post(':dealId/review')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  review(
    @Param('dealId') dealId: string,
    @Body(new ZodValidationPipe(dealReviewSchema)) dto: DealReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.deals.leaveReview(user.id, dealId, dto.rating, dto.text ?? null);
  }

  /**
   * Отзывы о человеке. Открыты всем: их читают до того, как решают
   * написать, и требовать вход на этом шаге бессмысленно.
   */
  @Get('reviews/:userId')
  reviews(@Param('userId') userId: string) {
    return this.deals.userReviews(userId);
  }
}
