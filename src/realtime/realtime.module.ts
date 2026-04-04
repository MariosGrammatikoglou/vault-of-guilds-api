import { Module, forwardRef } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { DbModule } from '../db/db.module';
import { PresenceModule } from '../presence/presence.module';
import { RolesModule } from '../roles/roles.module';
import { MessagesModule } from '../messages/messages.module';
import { DmModule } from '../dm/dm.module';

@Module({
  imports: [
    DbModule,
    PresenceModule,
    forwardRef(() => RolesModule),
    forwardRef(() => MessagesModule),
    DmModule,
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class RealtimeModule {}
