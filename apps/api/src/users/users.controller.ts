import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { ProfileViewItem, Review, SpecialistListItem } from '@app/shared';
import { UsersService } from './users.service';
import { ReviewsService } from '../reviews/reviews.service';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/** Личный кабинет. Все маршруты работают только со своими данными. */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get('history')
  history(@CurrentUser() user: RequestUser): Promise<ProfileViewItem[]> {
    return this.users.findViewHistory(user.id);
  }

  @Delete('history')
  @HttpCode(204)
  clearHistory(@CurrentUser() user: RequestUser): Promise<void> {
    return this.users.clearViewHistory(user.id);
  }

  @Get('reviews')
  myReviews(@CurrentUser() user: RequestUser): Promise<Review[]> {
    return this.reviews.findOwn(user.id);
  }

  @Get('favorites')
  favorites(@CurrentUser() user: RequestUser): Promise<SpecialistListItem[]> {
    return this.users.findFavorites(user.id);
  }

  @Post('favorites/:specialistId')
  toggleFavorite(
    @Param('specialistId') specialistId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ isFavorite: boolean }> {
    return this.users.toggleFavorite(user.id, specialistId);
  }
}
