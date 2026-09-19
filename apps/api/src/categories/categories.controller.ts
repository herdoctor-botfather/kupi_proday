import { Controller, Get, Query } from '@nestjs/common';
import type { Category, CategoryKind, ListingKind } from '@app/shared';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** По умолчанию услуги: так каталог специалистов работает без параметра. */
  @Get()
  findAll(@Query('kind') kind?: string, @Query('listingKind') listingKind?: string): Promise<Category[]> {
    const value: CategoryKind = kind === 'PRODUCT' ? 'PRODUCT' : 'SERVICE';
    const listings: ListingKind = listingKind === 'BUY' ? 'BUY' : 'SELL';
    return this.categories.findAll(value, listings);
  }
}
