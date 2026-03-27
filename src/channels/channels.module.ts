import { Module } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { DbModule } from '../db/db.module';
import { ServersModule } from '../servers/servers.module';
import { RolesModule } from '../roles/roles.module'; // <-- add

@Module({
  imports: [DbModule, ServersModule, RolesModule], // <-- add RolesModule
  providers: [ChannelsService],
  controllers: [ChannelsController],
  exports: [ChannelsService],
})
export class ChannelsModule {}
