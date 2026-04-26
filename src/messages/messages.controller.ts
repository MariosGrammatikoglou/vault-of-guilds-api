import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Req,
  UseGuards,
  Body,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { MessagesService } from './messages.service';
import { SendMessageDto, EditMessageDto, AddReactionDto } from './dto';

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

  @Patch(':id')
  edit(@Req() req: any, @Param('id') id: string, @Body() dto: EditMessageDto) {
    return this.messages.edit(id, req.user.sub, dto.content);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.messages.delete(id, req.user.sub);
  }

  @Post(':id/reactions')
  addReaction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: AddReactionDto,
  ) {
    return this.messages.addReaction(id, req.user.sub, dto.emoji);
  }

  @Delete(':id/reactions/:emoji')
  removeReaction(
    @Req() req: any,
    @Param('id') id: string,
    @Param('emoji') emoji: string,
  ) {
    return this.messages.removeReaction(id, req.user.sub, emoji);
  }
}
