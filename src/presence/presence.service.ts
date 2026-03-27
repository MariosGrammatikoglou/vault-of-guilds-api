import { Injectable } from '@nestjs/common';
import { PgService } from '../db/pg.service';

@Injectable()
export class PresenceService {
  constructor(private db: PgService) {}

  // userId -> connection count
  private counters = new Map<string, number>();
  // socketId -> userId
  private sockets = new Map<string, string>();

  userConnected(userId: string, socketId: string) {
    const n = (this.counters.get(userId) || 0) + 1;
    this.counters.set(userId, n);
    this.sockets.set(socketId, userId);
  }

  userDisconnected(socketId: string) {
    const userId = this.sockets.get(socketId);
    if (!userId) return;
    this.sockets.delete(socketId);
    const n = (this.counters.get(userId) || 1) - 1;
    if (n <= 0) this.counters.delete(userId);
    else this.counters.set(userId, n);
  }

  /** who is globally online (userId[]) */
  onlineUserIds(): string[] {
    return [...this.counters.keys()];
  }

  /** Return server members + online flag + color */
  async membersWithPresence(serverId: string) {
    const rows = await this.db.query<{
      id: string;
      username: string;
      display_color: string | null;
    }>(
      `SELECT u.id, u.username, u.display_color
         FROM server_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.server_id = $1
        ORDER BY u.username ASC`,
      [serverId],
    );
    const online = new Set(this.onlineUserIds());
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      online: online.has(r.id),
      color: r.display_color,
    }));
  }

  /** Online ids for a given server (subset of members) */
  async onlineForServer(serverId: string): Promise<string[]> {
    const members = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM server_members WHERE server_id=$1',
      [serverId],
    );
    const online = new Set(this.onlineUserIds());
    return members.map((m) => m.user_id).filter((uid) => online.has(uid));
  }
}
