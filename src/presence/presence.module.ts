import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { PresenceGateway } from './presence.gateway';
import { PresenceController } from './presence.controller';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  providers: [PresenceService, PresenceGateway],
  controllers: [PresenceController],
  exports: [PresenceService], // <-- export so other modules can inject
})
export class PresenceModule {}
