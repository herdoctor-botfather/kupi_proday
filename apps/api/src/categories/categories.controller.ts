import { Controller, Get, Query } from '@nestjs/common';
import type { Category, CategoryKind } from '@app/shared';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** По умолчанию услуги: так каталог специалистов работает без параметра. */
  @Get()
  findAll(@Query('kind') kind?: string): Promise<Category[]> {
    const value: CategoryKind = kind === 'PRODUCT' ? 'PRODUCT' : 'SERVICE';
    return this.categories.findAll(value);
  }
}
