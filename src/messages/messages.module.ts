import { Module, forwardRef } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { DbModule } from '../db/db.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [DbModule, forwardRef(() => RolesModule)],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
