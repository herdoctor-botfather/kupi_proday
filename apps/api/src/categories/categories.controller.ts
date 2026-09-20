import { Controller, Get, Param, Query } from '@nestjs/common';
import type { Category, CategoryAttribute, CategoryKind, ListingKind } from '@app/shared';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** По умолчанию услуги: так каталог специалистов работает без параметра. */
  @Get()
  findAll(@Query('kind') kind?: string, @Query('listingKind') listingKind?: string): Promise<Category[]> {
    const value: CategoryKind = kind === 'PRODUCT' ? 'PRODUCT' : kind === 'JOB' ? 'JOB' : 'SERVICE';
    const listings: ListingKind =
      listingKind === 'BUY' || listingKind === 'JOB' || listingKind === 'RESUME' ? listingKind : 'SELL';
    return this.categories.findAll(value, listings);
  }

  /** Что спрашивать у продавца и по чему искать в этой категории. */
  @Get(':slug/attributes')
  attributes(@Param('slug') slug: string): Promise<CategoryAttribute[]> {
    return this.categories.attributes(slug);
  }
}
