import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadsModule } from './uploads/uploads.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { SpecialistsModule } from './specialists/specialists.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { ReportsModule } from './reports/reports.module';
import { ChatModule } from './chat/chat.module';
import { ListingsModule } from './listings/listings.module';
import { PaymentsModule } from './payments/payments.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    NotificationsModule,
    UploadsModule,
    AuthModule,
    CategoriesModule,
    SpecialistsModule,
    ReviewsModule,
    UsersModule,
    AdminModule,
    ReportsModule,
    ChatModule,
    ListingsModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
