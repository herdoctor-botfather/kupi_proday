import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { PHOTO_DRAFT_MAX, textDraftSchema, type TextDraftDto } from '@app/shared';
import { z } from 'zod';
import { TextService } from './text.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/**
 * Снимок и список слагов, из которых модель выбирает категорию.
 *
 * Предел в шесть мегабайт: снимок с телефона после сжатия в браузере
 * укладывается с запасом, а всё, что больше, — либо ошибка, либо
 * попытка нагрузить чужой счёт.
 */
const photoSchema = z
  .string()
  .startsWith('data:image/', 'Ожидается изображение')
  .max(6_000_000, 'Слишком большая фотография');

/*
 * Снимков может быть несколько — одна вещь с разных сторон: спереди
 * не видно ни бирки, ни потёртости на спине. Поле image осталось для
 * приложения прежней сборки, которое Telegram ещё держит в памяти.
 */
const photoDraftSchema = z
  .object({
    image: photoSchema.optional(),
    images: z.array(photoSchema).max(PHOTO_DRAFT_MAX, `Не больше ${PHOTO_DRAFT_MAX} фотографий`).optional(),
    categories: z.array(z.string().max(64)).max(300).default([]),
  })
  .transform(({ image, images, categories }) => ({
    images: images?.length ? images : image ? [image] : [],
    categories,
  }))
  .refine((dto) => dto.images.length > 0, { message: 'Нужна хотя бы одна фотография' });
type PhotoDraftDto = z.infer<typeof photoDraftSchema>;

/** Черновики текстов для форм: описание объявления, рассказ о себе. */
@Controller('text')
@UseGuards(JwtAuthGuard)
export class TextController {
  constructor(private readonly text: TextService) {}

  @Post('draft')
  @HttpCode(200)
  draft(
    @Body(new ZodValidationPipe(textDraftSchema)) dto: TextDraftDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.text.draft(user.id, dto);
  }

  /**
   * Заготовка объявления по фотографии.
   *
   * Снимок приходит строкой data:image — тем же, что уже лежит в форме,
   * и не требует ни отдельной загрузки, ни хранения: он нужен один раз,
   * чтобы на него посмотрели.
   */
  @Post('from-photo')
  @HttpCode(200)
  fromPhoto(
    @Body(new ZodValidationPipe(photoDraftSchema)) dto: PhotoDraftDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.text.fromPhoto(user.id, dto.images, dto.categories);
  }
}
