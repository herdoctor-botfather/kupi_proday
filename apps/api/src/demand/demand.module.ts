import { Module } from '@nestjs/common';
import { DemandController } from './demand.controller';
import { DemandService } from './demand.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DemandController],
  providers: [DemandService],
  // Рассылку запускает модерация, когда запрос выходит на витрину.
  exports: [DemandService],
})
export class DemandModule {}
