import { Module } from '@nestjs/common';
import { ListingsController, MyListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { PaymentsModule } from '../payments/payments.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [PaymentsModule, ReferralsModule],
  controllers: [ListingsController, MyListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
