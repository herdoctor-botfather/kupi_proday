import { Controller, Get } from '@nestjs/common';
import type { Category } from '@app/shared';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll(): Promise<Category[]> {
    return this.categories.findAll();
  }
}
