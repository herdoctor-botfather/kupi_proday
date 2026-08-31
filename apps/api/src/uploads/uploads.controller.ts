import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { MAX_UPLOAD_BYTES } from '../storage/storage.types';

/**
 * Загрузка изображений.
 *
 * Файл принимается в память, а не на диск: он заведомо небольшой, а так
 * не остаётся временных файлов, которые пришлось бы убирать при ошибке.
 * Настоящий тип определяется по содержимому — заголовку от клиента не верим.
 */
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<{ url: string; key: string }> {
    if (!file) {
      throw new BadRequestException({ code: 'NO_FILE', message: 'Файл не передан' });
    }
    return this.storage.putImage(file.buffer, 'gallery', user.id);
  }
}
