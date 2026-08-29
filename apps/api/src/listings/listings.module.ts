import { Module } from '@nestjs/common';
import { ListingsController, MyListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  controllers: [ListingsController, MyListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
