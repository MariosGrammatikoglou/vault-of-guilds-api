import { Module, forwardRef } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { DbModule } from '../db/db.module';
import { PresenceModule } from '../presence/presence.module';
import { RolesModule } from '../roles/roles.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    DbModule,
    PresenceModule,
    forwardRef(() => RolesModule),
    forwardRef(() => MessagesModule),
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class RealtimeModule {}
