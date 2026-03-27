import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private channels: ChannelsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateChannelDto) {
    return this.channels.create(dto.serverId, dto.name, dto.type, req.user.sub);
  }

  @Get('list')
  list(@Req() req: any, @Query('serverId') serverId: string) {
    return this.channels.list(serverId, req.user.sub);
  }
}
