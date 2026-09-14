import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { textDraftSchema, type TextDraftDto } from '@app/shared';
import { TextService } from './text.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

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
}
