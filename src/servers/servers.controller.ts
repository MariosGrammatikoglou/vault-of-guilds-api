import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ServersService } from './servers.service';
import { PresenceService } from '../presence/presence.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Multer } from 'multer';

type CreateServerBody = { name: string };
type JoinServerBody = { serverId?: string; code?: string };

@UseGuards(JwtAuthGuard)
@Controller('servers')
export class ServersController {
  constructor(
    private servers: ServersService,
    private presence: PresenceService,
  ) {}

  @Post()
  create(@Req() req: { user: { sub: string } }, @Body() dto: CreateServerBody) {
    return this.servers.create(dto.name, req.user.sub);
  }

  @Post('join')
  async join(
    @Req() req: { user: { sub: string } },
    @Body() dto: JoinServerBody,
  ) {
    if (dto.code && dto.code.trim().length > 0) {
      return this.servers.joinByCode(dto.code.trim(), req.user.sub);
    }
    if (dto.serverId && dto.serverId.trim().length > 0) {
      return this.servers.join(dto.serverId.trim(), req.user.sub);
    }
    throw new ForbiddenException('Provide either "code" or "serverId".');
  }

  @Get('mine')
  mine(@Req() req: { user: { sub: string } }) {
    return this.servers.myServers(req.user.sub);
  }

  @Get(':serverId/invite')
  async invite(
    @Req() req: { user: { sub: string } },
    @Param('serverId') serverId: string,
  ) {
    const isMember = await this.servers.isMember(serverId, req.user.sub);
    if (!isMember) throw new ForbiddenException('Not a member of this server');
    return { serverId, code: this.servers.getInviteCode(serverId) };
  }

  @Get(':serverId/members')
  async members(
    @Req() req: { user: { sub: string } },
    @Param('serverId') serverId: string,
  ) {
    await this.servers.ensureMember(serverId, req.user.sub);
    return this.presence.membersWithPresence(serverId);
  }

  @Post(':serverId/icon')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadIcon(
    @Req() req: { user: { sub: string } },
    @Param('serverId') serverId: string,
    @UploadedFile() file: Multer.File,
  ) {
    if (!file) throw new ForbiddenException('No file uploaded');
    // Store as base64 data URL in the DB so it persists across server restarts
    const mime = file.mimetype || 'image/png';
    const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
    const updated = await this.servers.setIconUrl(
      serverId,
      req.user.sub,
      dataUrl,
    );
    return { ok: true, server: updated };
  }

  @Post(':serverId/kick/:userId')
  async kickMember(
    @Req() req: { user: { sub: string } },
    @Param('serverId') serverId: string,
    @Param('userId') userId: string,
  ) {
    return this.servers.kickMember(serverId, req.user.sub, userId);
  }

  @Post(':serverId/delete')
  async deleteServer(
    @Req() req: { user: { sub: string } },
    @Param('serverId') serverId: string,
  ) {
    return this.servers.deleteServer(serverId, req.user.sub);
  }

  @Post(':serverId/transfer/:userId')
  async transferOwnership(
    @Req() req: { user: { sub: string } },
    @Param('serverId') serverId: string,
    @Param('userId') userId: string,
  ) {
    return this.servers.transferOwnership(serverId, req.user.sub, userId);
  }
}
