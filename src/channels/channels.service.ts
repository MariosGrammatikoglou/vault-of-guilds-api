import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PgService } from '../db/pg.service';
import { ServersService } from '../servers/servers.service';
import { RolesService } from '../roles/roles.service';
import { PERMS } from '../roles/permissions';

@Injectable()
export class ChannelsService {
  constructor(
    private db: PgService,
    private servers: ServersService,
    private roles: RolesService,
  ) {}

  async create(
    serverId: string,
    name: string,
    type: 'text' | 'voice',
    userId: string,
  ) {
    await this.servers.ensureMember(serverId, userId);
    await this.roles.ensurePerm(serverId, userId, PERMS.MANAGE_CHANNELS);

    const [c] = await this.db.query<any>(
      'INSERT INTO channels (server_id, name, type) VALUES ($1,$2,$3) RETURNING *',
      [serverId, name, type],
    );
    return c;
  }

  async list(serverId: string, userId: string) {
    await this.servers.ensureMember(serverId, userId);
    return this.db.query<any>(
      'SELECT * FROM channels WHERE server_id=$1 ORDER BY created_at ASC',
      [serverId],
    );
  }

  async ensureCanJoinVoice(channelId: string, userId: string) {
    const [channel] = await this.db.query<{
      id: string;
      server_id: string;
      type: 'text' | 'voice';
    }>('SELECT id, server_id, type FROM channels WHERE id=$1', [channelId]);

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.type !== 'voice') {
      throw new ForbiddenException('Not a voice channel');
    }

    await this.servers.ensureMember(channel.server_id, userId);
    await this.roles.ensurePerm(channel.server_id, userId, PERMS.CONNECT_VOICE);

    return channel;
  }
}
