import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PaymentsModule],
  controllers: [ImagesController],
  providers: [ImagesService],
  // Бот рисует через служебный вход — ему нужна та же служба.
  exports: [ImagesService],
})
export class ImagesModule {}
