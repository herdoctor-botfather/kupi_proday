import { Module } from '@nestjs/common';
import { ListingsController, MyListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [ListingsController, MyListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
