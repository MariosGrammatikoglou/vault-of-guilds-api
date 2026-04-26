import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
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

    return { ...msg, reactions: [], server_id: serverId };
  }

  async edit(messageId: string, userId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Content cannot be empty');

    const [msg] = await this.db.query<any>(
      `SELECT m.*, u.username, u.display_color AS user_color
         FROM messages m
         JOIN users u ON u.id = m.user_id
        WHERE m.id = $1`,
      [messageId],
    );

    if (!msg) throw new NotFoundException('Message not found');
    if (msg.user_id !== userId) throw new ForbiddenException('Not your message');

    const [updated] = await this.db.query<any>(
      `UPDATE messages SET content = $1, edited_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [trimmed, messageId],
    );

    return {
      ...updated,
      username: msg.username,
      user_color: msg.user_color,
      reactions: await this.getReactions(messageId, userId),
    };
  }

  async delete(messageId: string, userId: string) {
    const [msg] = await this.db.query<{ user_id: string; channel_id: string }>(
      `SELECT user_id, channel_id FROM messages WHERE id = $1`,
      [messageId],
    );

    if (!msg) throw new NotFoundException('Message not found');

    const isOwner = msg.user_id === userId;
    if (!isOwner) {
      const [ch] = await this.db.query<{ server_id: string }>(
        'SELECT server_id FROM channels WHERE id = $1',
        [msg.channel_id],
      );
      if (!ch) throw new ForbiddenException('Cannot delete');
      await this.roles.ensurePerm(ch.server_id, userId, PERMS.MANAGE_CHANNELS);
    }

    await this.db.query('DELETE FROM messages WHERE id = $1', [messageId]);
    return { id: messageId, channel_id: msg.channel_id };
  }

  async addReaction(messageId: string, userId: string, emoji: string) {
    const [msg] = await this.db.query<{ channel_id: string }>(
      'SELECT channel_id FROM messages WHERE id = $1',
      [messageId],
    );
    if (!msg) throw new NotFoundException('Message not found');
    await this.ensureChannelMember(msg.channel_id, userId);

    await this.db.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, userId, emoji],
    );

    return {
      messageId,
      channelId: msg.channel_id,
      reactions: await this.getReactions(messageId, userId),
    };
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const [msg] = await this.db.query<{ channel_id: string }>(
      'SELECT channel_id FROM messages WHERE id = $1',
      [messageId],
    );
    if (!msg) throw new NotFoundException('Message not found');

    await this.db.query(
      'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
      [messageId, userId, emoji],
    );

    return {
      messageId,
      channelId: msg.channel_id,
      reactions: await this.getReactions(messageId, userId),
    };
  }

  async getReactions(messageId: string, viewerUserId?: string) {
    const rows = await this.db.query<{ emoji: string; user_id: string }>(
      'SELECT emoji, user_id FROM message_reactions WHERE message_id = $1',
      [messageId],
    );

    const map = new Map<string, string[]>();
    for (const r of rows) {
      const list = map.get(r.emoji) ?? [];
      list.push(r.user_id);
      map.set(r.emoji, list);
    }

    return Array.from(map.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      user_ids: userIds,
      reacted: viewerUserId ? userIds.includes(viewerUserId) : false,
    }));
  }

  private buildReactionsSubquery() {
    return `
      COALESCE(
        (SELECT json_agg(r) FROM (
          SELECT emoji, array_agg(user_id::text) AS user_ids, count(*)::int AS "count"
          FROM message_reactions
          WHERE message_id = m.id
          GROUP BY emoji
        ) r),
        '[]'::json
      ) AS reactions
    `;
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
      SELECT m.*, u.username, u.display_color AS user_color,
        ${this.buildReactionsSubquery()}
        FROM messages m
        JOIN users u ON u.id = m.user_id
        ${where}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $${params.length}
    `;

    const rows = await this.db.query<any>(sql, params);

    return rows.reverse().map((row) => ({
      ...row,
      reactions: (row.reactions ?? []).map((r: any) => ({
        ...r,
        reacted: r.user_ids?.includes(userId) ?? false,
      })),
    }));
  }
}
