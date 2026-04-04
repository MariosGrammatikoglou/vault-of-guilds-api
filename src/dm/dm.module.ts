import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { DmService } from './dm.service';
import { DmController } from './dm.controller';

@Module({
  imports: [DbModule],
  providers: [DmService],
  controllers: [DmController],
  exports: [DmService],
})
export class DmModule {}
