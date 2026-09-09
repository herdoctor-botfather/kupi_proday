import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ReviewsModule } from '../reviews/reviews.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ReviewsModule, StorageModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
