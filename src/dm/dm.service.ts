import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PgService } from '../db/pg.service';

@Injectable()
export class DmService implements OnModuleInit {
  constructor(private db: PgService) {}

  async onModuleInit() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dm_channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user1_id, user2_id)
      )
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS dm_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dm_channel_id UUID NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_dm_messages_channel_created
        ON dm_messages(dm_channel_id, created_at DESC)
    `);

    const cleanup = async () => {
      await this.db.query(
        `DELETE FROM dm_messages WHERE created_at < NOW() - INTERVAL '21 days'`,
      );
    };
    void cleanup();
    setInterval(() => void cleanup(), 6 * 60 * 60 * 1000);
  }

  async openChannel(userId: string, targetUserId: string) {
    if (userId === targetUserId)
      throw new BadRequestException('Cannot DM yourself');

    const [u1, u2] =
      userId < targetUserId
        ? [userId, targetUserId]
        : [targetUserId, userId];

    await this.db.query(
      `INSERT INTO dm_channels (user1_id, user2_id) VALUES ($1, $2)
       ON CONFLICT (user1_id, user2_id) DO NOTHING`,
      [u1, u2],
    );

    const [ch] = await this.db.query<{
      id: string;
      user1_id: string;
      user2_id: string;
      created_at: string;
    }>('SELECT * FROM dm_channels WHERE user1_id=$1 AND user2_id=$2', [u1, u2]);

    const otherId = ch.user1_id === userId ? ch.user2_id : ch.user1_id;
    const [other] = await this.db.query<{ username: string }>(
      'SELECT username FROM users WHERE id=$1',
      [otherId],
    );

    return {
      id: ch.id,
      other_user_id: otherId,
      other_username: other?.username ?? 'Unknown',
      created_at: ch.created_at,
    };
  }

  async listChannels(userId: string) {
    return this.db.query<{
      id: string;
      other_user_id: string;
      other_username: string;
      created_at: string;
    }>(
      `SELECT dc.id,
              CASE WHEN dc.user1_id = $1 THEN dc.user2_id ELSE dc.user1_id END AS other_user_id,
              u.username AS other_username,
              dc.created_at
         FROM dm_channels dc
         JOIN users u ON u.id = CASE WHEN dc.user1_id = $1 THEN dc.user2_id ELSE dc.user1_id END
        WHERE dc.user1_id = $1 OR dc.user2_id = $1
        ORDER BY dc.created_at DESC`,
      [userId],
    );
  }

  async sendMessage(channelId: string, senderId: string, content: string) {
    const [ch] = await this.db.query<{ user1_id: string; user2_id: string }>(
      'SELECT * FROM dm_channels WHERE id=$1',
      [channelId],
    );
    if (!ch) throw new NotFoundException('DM channel not found');
    if (ch.user1_id !== senderId && ch.user2_id !== senderId)
      throw new ForbiddenException('Not a member of this DM');

    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');

    const [row] = await this.db.query<{ id: string }>(
      'INSERT INTO dm_messages (dm_channel_id, sender_id, content) VALUES ($1,$2,$3) RETURNING id',
      [channelId, senderId, trimmed],
    );

    const [msg] = await this.db.query<any>(
      `SELECT dm.*, u.username AS sender_username
         FROM dm_messages dm
         JOIN users u ON u.id = dm.sender_id
        WHERE dm.id = $1`,
      [row.id],
    );

    return msg;
  }

  async listMessages(
    channelId: string,
    userId: string,
    limit = 30,
    before?: string,
  ) {
    const [ch] = await this.db.query<{ user1_id: string; user2_id: string }>(
      'SELECT * FROM dm_channels WHERE id=$1',
      [channelId],
    );
    if (!ch) throw new NotFoundException('DM channel not found');
    if (ch.user1_id !== userId && ch.user2_id !== userId)
      throw new ForbiddenException('Not a member of this DM');

    const safeLimit = Math.max(1, Math.min(limit, 50));
    const params: any[] = [channelId];
    let where = 'WHERE dm.dm_channel_id = $1';

    if (before) {
      params.push(before);
      where += ` AND dm.created_at < (SELECT created_at FROM dm_messages WHERE id = $2)`;
    }

    params.push(safeLimit);

    const sql = `
      SELECT dm.*, u.username AS sender_username
        FROM dm_messages dm
        JOIN users u ON u.id = dm.sender_id
        ${where}
       ORDER BY dm.created_at DESC, dm.id DESC
       LIMIT $${params.length}
    `;

    const rows = await this.db.query<any>(sql, params);
    return rows.reverse();
  }

  async getChannelUsers(channelId: string) {
    const [ch] = await this.db.query<{ user1_id: string; user2_id: string }>(
      'SELECT * FROM dm_channels WHERE id=$1',
      [channelId],
    );
    return ch ?? null;
  }
}
