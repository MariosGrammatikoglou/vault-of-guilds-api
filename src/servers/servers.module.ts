import { Module, forwardRef } from '@nestjs/common';
import { ServersService } from './servers.service';
import { ServersController } from './servers.controller';
import { DbModule } from '../db/db.module';
import { PresenceModule } from '../presence/presence.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [DbModule, PresenceModule, forwardRef(() => RolesModule)],
  providers: [ServersService],
  controllers: [ServersController],
  exports: [ServersService],
})
export class ServersModule {}
