import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ServersModule } from './servers/servers.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RolesModule } from './roles/roles.module';
import { PresenceModule } from './presence/presence.module';
import { DmModule } from './dm/dm.module';

@Module({
  imports: [
    DbModule,
    UsersModule,
    AuthModule,
    ServersModule,
    ChannelsModule,
    MessagesModule,
    RealtimeModule,
    RolesModule,
    PresenceModule,
    DmModule,
  ],
})
export class AppModule {}
