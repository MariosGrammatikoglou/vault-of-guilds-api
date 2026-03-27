import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  Body,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private messages: MessagesService) {}

  @Post()
  async send(@Req() req: any, @Body() dto: SendMessageDto) {
    return this.messages.send(dto.channelId, req.user.sub, dto.content);
  }

  @Get('list')
  list(
    @Req() req: any,
    @Query('channelId') channelId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit ?? 20);
    const safeLimit = Number.isFinite(parsed)
      ? Math.max(1, Math.min(parsed, 50))
      : 20;

    return this.messages.list(channelId, req.user.sub, safeLimit, before);
  }
}
