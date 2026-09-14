import { Module } from '@nestjs/common';
import { UrgentController } from './urgent.controller';
import { UrgentService } from './urgent.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [UrgentController],
  providers: [UrgentService],
  // Бот принимает «Беру» прямо в переписке: вызов срочный, и путь через
  // приложение съедал бы минуты, ради которых всё и затеяно.
  exports: [UrgentService],
})
export class UrgentModule {}
