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
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  listingQuerySchema,
  listingSchema,
  type ListingDetail,
  type ListingDto,
  type ListingListItem,
  type ListingQuery,
  type MyListing,
  type Paginated,
} from '@app/shared';
import { ListingsService } from './listings.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { MAX_UPLOAD_BYTES } from '../storage/storage.types';

/** Витрина объявлений. Смотреть можно без авторизации, как и каталог услуг. */
@Controller('listings')
@UseGuards(OptionalJwtAuthGuard)
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  findMany(
    @Query(new ZodValidationPipe(listingQuerySchema)) query: ListingQuery,
  ): Promise<Paginated<ListingListItem>> {
    return this.listings.findMany(query);
  }

  /** Города с объявлениями — для фильтра. Объявлен до :idOrSlug, иначе примет за адрес. */
  @Get('cities')
  findCities(@Query('q') q?: string): Promise<{ name: string; count: number }[]> {
    return this.listings.findCities(q?.trim() || undefined);
  }

  @Get(':idOrSlug')
  findOne(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentUser() user: RequestUser | null,
  ): Promise<ListingDetail> {
    return this.listings.findOne(idOrSlug, user?.id ?? null);
  }
}

/** Свои объявления: размещение, правка, фотографии, продажа. */
@Controller('me/listings')
@UseGuards(JwtAuthGuard)
export class MyListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  findOwn(@CurrentUser() user: RequestUser): Promise<MyListing[]> {
    return this.listings.findOwn(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<MyListing> {
    return this.listings.findOwnOne(user.id, id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(listingSchema)) dto: ListingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MyListing> {
    return this.listings.create(user.id, dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(listingSchema)) dto: ListingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<MyListing> {
    return this.listings.update(user.id, id, dto);
  }

  @Post(':id/sold')
  markSold(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<MyListing> {
    return this.listings.markSold(user.id, id);
  }

  @Post(':id/hide')
  hide(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<MyListing> {
    return this.listings.hide(user.id, id);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<MyListing> {
    return this.listings.publish(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.listings.remove(user.id, id);
  }

  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async addPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<MyListing> {
    if (!file) throw new BadRequestException({ code: 'NO_FILE', message: 'Файл не передан' });
    const stored = await this.storage.putImage(file.buffer, 'gallery', user.id);
    return this.listings.addPhoto(user.id, id, stored);
  }

  @Delete('photos/:photoId')
  @HttpCode(204)
  removePhoto(@Param('photoId') photoId: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.listings.removePhoto(user.id, photoId);
  }
}
