import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  // Зачёт приглашения случается там же, где выдаётся первый подарок, —
  // при размещении объявления и подаче анкеты.
  exports: [ReferralsService],
})
export class ReferralsModule {}
