import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TelegramStarsService } from './telegram-stars.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, TelegramStarsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
