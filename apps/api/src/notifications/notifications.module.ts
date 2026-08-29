import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ContactPolicyService } from './contact-policy.service';

@Global()
@Module({
  providers: [NotificationsService, ContactPolicyService],
  exports: [NotificationsService, ContactPolicyService],
})
export class NotificationsModule {}
