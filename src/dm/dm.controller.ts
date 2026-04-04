import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { DmService } from './dm.service';

@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(private dm: DmService) {}

  @Post('open')
  open(
    @Req() req: { user: { sub: string } },
    @Body() body: { targetUserId: string },
  ) {
    return this.dm.openChannel(req.user.sub, body.targetUserId);
  }

  @Get('list')
  list(@Req() req: { user: { sub: string } }) {
    return this.dm.listChannels(req.user.sub);
  }

  @Post('send')
  send(
    @Req() req: { user: { sub: string } },
    @Body() body: { channelId: string; content: string },
  ) {
    return this.dm.sendMessage(body.channelId, req.user.sub, body.content);
  }

  @Get('messages')
  messages(
    @Req() req: { user: { sub: string } },
    @Query('channelId') channelId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.dm.listMessages(
      channelId,
      req.user.sub,
      limit ? Number(limit) : 30,
      before,
    );
  }
}
