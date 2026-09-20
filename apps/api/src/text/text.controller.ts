import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { textDraftSchema, type TextDraftDto } from '@app/shared';
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
const photoDraftSchema = z.object({
  image: z
    .string()
    .startsWith('data:image/', 'Ожидается изображение')
    .max(6_000_000, 'Слишком большая фотография'),
  categories: z.array(z.string().max(64)).max(300).default([]),
});
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
    return this.text.fromPhoto(user.id, dto.image, dto.categories);
  }
}
