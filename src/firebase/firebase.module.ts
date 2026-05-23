import { Global, Module } from '@nestjs/common';
import { PushMessagingService } from './push-messaging.service';

@Global()
@Module({
  providers: [PushMessagingService],
  exports: [PushMessagingService],
})
export class FirebaseModule {}
