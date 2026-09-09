import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';
import { PaymentsModule } from '../payments/payments.module';
import { SpecialistsModule } from '../specialists/specialists.module';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [PaymentsModule, SpecialistsModule, ListingsModule],
  controllers: [InternalController],
  providers: [InternalService],
})
export class InternalModule {}
