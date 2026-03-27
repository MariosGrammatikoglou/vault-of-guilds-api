import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PgService } from '../db/pg.service';
import { RolesService } from '../roles/roles.service';
import { PERMS } from '../roles/permissions';

@Injectable()
export class MessagesService {
  constructor(
    private db: PgService,
    private roles: RolesService,
  ) {}

  private async ensureChannelMember(
    channelId: string,
    userId: string,
  ): Promise<string> {
    const [row] = await this.db.query<{ server_id: string }>(
      `SELECT c.server_id FROM channels c WHERE c.id = $1`,
      [channelId],
    );

    if (!row) throw new ForbiddenException('Channel not found');

    const [m] = await this.db.query(
      'SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2',
      [row.server_id, userId],
    );

    if (!m) throw new ForbiddenException('Not a member');

    return row.server_id;
  }

  async send(channelId: string, userId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');

    const serverId = await this.ensureChannelMember(channelId, userId);

    await this.roles.ensurePerm(serverId, userId, PERMS.SEND_MESSAGES);

    const [row] = await this.db.query<{ id: string }>(
      'INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
      [channelId, userId, trimmed],
    );

    const [msg] = await this.db.query<any>(
      `SELECT m.*, u.username, u.display_color AS user_color
         FROM messages m
         JOIN users u ON u.id = m.user_id
        WHERE m.id = $1`,
      [row.id],
    );

    return msg;
  }

  async list(channelId: string, userId: string, limit = 20, before?: string) {
    await this.ensureChannelMember(channelId, userId);

    const safeLimit = Math.max(1, Math.min(limit, 50));
    const params: any[] = [channelId];
    let where = 'WHERE m.channel_id = $1';

    if (before) {
      params.push(before);
      where += `
        AND (m.created_at, m.id) < (
          SELECT created_at, id
          FROM messages
          WHERE id = $2 AND channel_id = $1
        )
      `;
    }

    params.push(safeLimit);

    const sql = `
      SELECT m.*, u.username, u.display_color AS user_color
        FROM messages m
        JOIN users u ON u.id = m.user_id
        ${where}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $${params.length}
    `;

    const rows = await this.db.query<any>(sql, params);
    return rows.reverse();
  }
}
