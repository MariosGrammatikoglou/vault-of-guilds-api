import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PresenceService } from './presence.service';

@UseGuards(JwtAuthGuard)
@Controller('presence')
export class PresenceController {
  constructor(private presence: PresenceService) {}

  @Get('members')
  members(@Query('serverId') serverId: string) {
    return this.presence.membersWithPresence(serverId);
  }
}
