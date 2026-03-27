import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PgService } from '../db/pg.service';
import { generateInviteCode, matchesCode } from './invite.util';
import { RolesService } from '../roles/roles.service';
import { PERMS } from '../roles/permissions';

type ServerRow = {
  id: string;
  name: string;
  owner_id: string;
  icon_url?: string | null;
  created_at: string;
};

@Injectable()
export class ServersService {
  constructor(
    private db: PgService,
    @Inject(forwardRef(() => RolesService))
    private rolesService: RolesService,
  ) {}

  async create(name: string, ownerId: string): Promise<ServerRow> {
    const [s] = await this.db.query<ServerRow>(
      'INSERT INTO servers (name, owner_id) VALUES ($1,$2) RETURNING *',
      [name, ownerId],
    );

    await this.db.query(
      'INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [s.id, ownerId, 'owner'],
    );

    return s;
  }

  async join(serverId: string, userId: string): Promise<{ ok: true }> {
    await this.db.query(
      'INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [serverId, userId, 'member'],
    );
    return { ok: true };
  }

  async myServers(userId: string): Promise<ServerRow[]> {
    return this.db.query<ServerRow>(
      `SELECT s.*
         FROM servers s
         JOIN server_members m ON m.server_id = s.id
        WHERE m.user_id = $1
        ORDER BY s.created_at DESC`,
      [userId],
    );
  }

  async ensureMember(serverId: string, userId: string): Promise<void> {
    const [m] = await this.db.query<{ exists: number }>(
      'SELECT 1 as exists FROM server_members WHERE server_id=$1 AND user_id=$2',
      [serverId, userId],
    );
    if (!m) throw new ForbiddenException('Not a member');
  }

  async ensureOwner(serverId: string, userId: string): Promise<void> {
    const [s] = await this.db.query<ServerRow>(
      'SELECT * FROM servers WHERE id=$1',
      [serverId],
    );
    if (!s) throw new NotFoundException('Server not found');
    if (s.owner_id !== userId) {
      throw new ForbiddenException('Only the owner can perform this action');
    }
  }

  async isMember(serverId: string, userId: string): Promise<boolean> {
    const [m] = await this.db.query<{ exists: number }>(
      'SELECT 1 as exists FROM server_members WHERE server_id=$1 AND user_id=$2',
      [serverId, userId],
    );
    return !!m;
  }

  async addMember(
    serverId: string,
    userId: string,
    role: string = 'member',
  ): Promise<void> {
    await this.db.query(
      'INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [serverId, userId, role],
    );
  }

  async listMembers(
    serverId: string,
  ): Promise<Array<{ id: string; username: string }>> {
    return this.db.query<{ id: string; username: string }>(
      `SELECT u.id, u.username
         FROM server_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.server_id = $1
        ORDER BY u.username ASC`,
      [serverId],
    );
  }

  getInviteCode(serverId: string): string {
    return generateInviteCode(serverId);
  }

  async resolveServerByCode(code: string): Promise<string | null> {
    const rows = await this.db.query<{ id: string }>('SELECT id FROM servers');
    const up = code.toUpperCase();
    for (const row of rows) {
      if (matchesCode(row.id, up)) return row.id;
    }
    return null;
  }

  async joinByCode(
    code: string,
    userId: string,
  ): Promise<{ ok: true; serverId: string }> {
    const serverId = await this.resolveServerByCode(code);
    if (!serverId) {
      throw new NotFoundException('Invite code not found or expired');
    }
    await this.addMember(serverId, userId, 'member');
    return { ok: true, serverId };
  }

  async setIconUrl(
    serverId: string,
    userId: string,
    url: string,
  ): Promise<ServerRow> {
    await this.ensureOwner(serverId, userId);
    const [s] = await this.db.query<ServerRow>(
      'UPDATE servers SET icon_url=$1 WHERE id=$2 RETURNING *',
      [url, serverId],
    );
    if (!s) throw new NotFoundException('Server not found');
    return s;
  }

  async kickMember(serverId: string, actorId: string, targetUserId: string) {
    await this.ensureMember(serverId, actorId);
    await this.ensureMember(serverId, targetUserId);

    const [server] = await this.db.query<{ owner_id: string }>(
      'SELECT owner_id FROM servers WHERE id=$1',
      [serverId],
    );
    if (!server) throw new NotFoundException('Server not found');

    if (server.owner_id === targetUserId) {
      throw new ForbiddenException('Cannot kick the server owner');
    }

    if (actorId === targetUserId) {
      throw new ForbiddenException('Use leave instead of kicking yourself');
    }

    await this.rolesService.ensurePerm(serverId, actorId, PERMS.KICK_MEMBERS);

    await this.db.query(
      'DELETE FROM server_member_roles WHERE server_id=$1 AND user_id=$2',
      [serverId, targetUserId],
    );

    await this.db.query(
      'DELETE FROM server_members WHERE server_id=$1 AND user_id=$2',
      [serverId, targetUserId],
    );

    return { ok: true };
  }

  async deleteServer(serverId: string, userId: string) {
    await this.ensureOwner(serverId, userId);
    await this.db.query('DELETE FROM servers WHERE id=$1', [serverId]);
    return { ok: true };
  }

  async transferOwnership(
    serverId: string,
    ownerId: string,
    newOwnerId: string,
  ) {
    await this.ensureOwner(serverId, ownerId);
    await this.ensureMember(serverId, newOwnerId);

    if (ownerId === newOwnerId) {
      throw new ForbiddenException('That user is already the owner');
    }

    await this.db.query('UPDATE servers SET owner_id=$1 WHERE id=$2', [
      newOwnerId,
      serverId,
    ]);

    await this.db.query(
      `INSERT INTO server_members (server_id, user_id, role)
       VALUES ($1,$2,$3)
       ON CONFLICT (server_id, user_id) DO UPDATE SET role=EXCLUDED.role`,
      [serverId, newOwnerId, 'owner'],
    );

    await this.db.query(
      `INSERT INTO server_members (server_id, user_id, role)
       VALUES ($1,$2,$3)
       ON CONFLICT (server_id, user_id) DO UPDATE SET role=EXCLUDED.role`,
      [serverId, ownerId, 'member'],
    );

    return { ok: true };
  }
}
