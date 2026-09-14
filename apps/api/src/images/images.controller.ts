import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ImagesService } from './images.service';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/** Рисование картинок по описанию. */
@Controller('images')
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post('draw')
  @HttpCode(200)
  draw(@Body('prompt') prompt: string, @CurrentUser() user: RequestUser) {
    return this.images.draw(user.id, String(prompt ?? ''));
  }

  @Get('mine')
  mine(@CurrentUser() user: RequestUser) {
    return this.images.recent(user.id);
  }
}
