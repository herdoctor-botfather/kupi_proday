import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ProfileViewItem, Review, SpecialistListItem } from '@app/shared';
import { UsersService } from './users.service';
import { ReviewsService } from '../reviews/reviews.service';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { MAX_UPLOAD_BYTES } from '../storage/storage.types';

/** Личный кабинет. Все маршруты работают только со своими данными. */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly reviews: ReviewsService,
    private readonly storage: StorageService,
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

  /**
   * Своя фотография профиля.
   *
   * Отдельно от телеграмной: та приходит при каждом входе и любую нашу
   * замену затирает. Здесь человек ставит ту, которую выбрал сам.
   */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<{ photoUrl: string }> {
    if (!file) throw new BadRequestException({ code: 'NO_FILE', message: 'Файл не передан' });
    const stored = await this.storage.putImage(file.buffer, 'avatar', user.id);
    return this.users.setAvatar(user.id, stored);
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

/**
 * Публичный профиль. Открыт всем, включая гостей: карточку продавца
 * смотрят до того, как решают писать, и требовать вход на этом шаге
 * значило бы отсекать половину интереса.
 */
@Controller('users')
export class PublicUsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  profile(@Param('id') id: string) {
    return this.users.publicProfile(id);
  }
}