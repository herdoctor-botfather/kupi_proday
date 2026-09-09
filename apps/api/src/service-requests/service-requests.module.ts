import { Module } from '@nestjs/common';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ServiceRequestsController],
  providers: [ServiceRequestsService],
  // Чат спрашивает разрешение на переписку, бот — принимает заявки за мастера.
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
