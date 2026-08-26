import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  mapBoundsQuerySchema,
  specialistQuerySchema,
  type MapBoundsQuery,
  type Paginated,
  type SpecialistDetail,
  type SpecialistListItem,
  type SpecialistQuery,
} from '@app/shared';
import { SpecialistsService } from './specialists.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OptionalJwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/**
 * Каталог доступен и без авторизации, но для авторизованного пользователя
 * ответы дополняются персональными данными (свой отзыв, история просмотров).
 */
@Controller('specialists')
@UseGuards(OptionalJwtAuthGuard)
export class SpecialistsController {
  constructor(private readonly specialists: SpecialistsService) {}

  @Get()
  findMany(
    @Query(new ZodValidationPipe(specialistQuerySchema)) query: SpecialistQuery,
    @CurrentUser() user: RequestUser | null,
  ): Promise<Paginated<SpecialistListItem>> {
    return this.specialists.findMany(query, user?.id ?? null);
  }

  /** Города с опубликованными карточками — для подсказки в форме и фильтре. */
  @Get('cities')
  findCities(@Query('q') q?: string): Promise<{ name: string; count: number }[]> {
    return this.specialists.findCities(q?.trim() || undefined);
  }

  /** Маркеры для текущей области карты. */
  @Get('map')
  findInBounds(
    @Query(new ZodValidationPipe(mapBoundsQuerySchema)) query: MapBoundsQuery,
  ): Promise<SpecialistListItem[]> {
    return this.specialists.findInBounds(query);
  }

  @Get(':idOrSlug')
  findOne(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentUser() user: RequestUser | null,
  ): Promise<SpecialistDetail> {
    return this.specialists.findOne(idOrSlug, user?.id ?? null);
  }
}
