import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  replyToReviewSchema,
  specialistApplicationSchema,
  type MySpecialistProfile,
  type ReplyToReviewDto,
  type SpecialistApplicationDto,
} from '@app/shared';
import { MySpecialistService } from './my-specialist.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { MAX_UPLOAD_BYTES } from '../storage/storage.types';

/** Личная анкета специалиста: подача, правка, скрытие. */
@Controller('me/specialist')
@UseGuards(JwtAuthGuard)
export class MySpecialistController {
  constructor(
    private readonly mine: MySpecialistService,
    private readonly storage: StorageService,
  ) {}

  /** null, если анкета ещё не подавалась. */
  @Get()
  find(@CurrentUser() user: RequestUser): Promise<MySpecialistProfile | null> {
    return this.mine.findOwn(user.id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(specialistApplicationSchema)) dto: SpecialistApplicationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MySpecialistProfile> {
    return this.mine.create(user.id, dto);
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(specialistApplicationSchema)) dto: SpecialistApplicationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MySpecialistProfile> {
    return this.mine.update(user.id, dto);
  }

  @Post('hide')
  hide(@CurrentUser() user: RequestUser): Promise<MySpecialistProfile> {
    return this.mine.hide(user.id);
  }

  @Post('publish')
  publish(@CurrentUser() user: RequestUser): Promise<MySpecialistProfile> {
    return this.mine.publish(user.id);
  }

  /** Публичный ответ на отзыв о себе. Пустой текст удаляет ответ. */
  @Post('reviews/:reviewId/reply')
  async replyToReview(
    @Param('reviewId') reviewId: string,
    @Body(new ZodValidationPipe(replyToReviewSchema)) dto: ReplyToReviewDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MySpecialistProfile> {
    await this.mine.replyToReview(user.id, reviewId, dto.text);
    return (await this.mine.findOwn(user.id))!;
  }

  // ─── Фотографии ───

  /** Аватар анкеты. Загрузка и привязка одним запросом. */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async setAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<MySpecialistProfile> {
    if (!file) throw new BadRequestException({ code: 'NO_FILE', message: 'Файл не передан' });
    const stored = await this.storage.putImage(file.buffer, 'avatar', user.id);
    await this.mine.setAvatar(user.id, stored);
    return (await this.mine.findOwn(user.id))!;
  }

  /** Снимок работы в галерею. */
  @Post('photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async addPhoto(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('caption') caption: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<MySpecialistProfile> {
    if (!file) throw new BadRequestException({ code: 'NO_FILE', message: 'Файл не передан' });
    const stored = await this.storage.putImage(file.buffer, 'gallery', user.id);
    await this.mine.addPhoto(user.id, stored, caption?.trim() || null);
    return (await this.mine.findOwn(user.id))!;
  }

  @Delete('photos/:id')
  @HttpCode(204)
  removePhoto(@Param('id') photoId: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.mine.removePhoto(user.id, photoId);
  }
}
