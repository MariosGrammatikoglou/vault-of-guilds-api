import { Module, forwardRef } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { DbModule } from '../db/db.module';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [DbModule, forwardRef(() => ServersModule)],
  providers: [RolesService],
  controllers: [RolesController],
  exports: [RolesService],
})
export class RolesModule {}
