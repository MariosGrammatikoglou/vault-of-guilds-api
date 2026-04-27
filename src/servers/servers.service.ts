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
import { PERMS, ALL_PERMS } from '../roles/permissions';

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

    // Create default Admin role (all permissions) and Member role (send messages only)
    const [adminRole] = await this.db.query<{ id: string }>(
      `INSERT INTO server_roles (server_id, name, color, permissions, position)
       VALUES ($1, 'Admin', '#f97316', $2, 10) RETURNING id`,
      [s.id, ALL_PERMS],
    );
    const [memberRole] = await this.db.query<{ id: string }>(
      `INSERT INTO server_roles (server_id, name, color, permissions, position)
       VALUES ($1, 'Member', '#99AAB5', $2, 1) RETURNING id`,
      [s.id, PERMS.SEND_MESSAGES],
    );

    // Assign Admin + Member roles to owner
    await this.db.query(
      `INSERT INTO server_member_roles (server_id, user_id, role_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [s.id, ownerId, adminRole.id],
    );
    await this.db.query(
      `INSERT INTO server_member_roles (server_id, user_id, role_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [s.id, ownerId, memberRole.id],
    );

    return s;
  }

  private async assignMemberRole(serverId: string, userId: string): Promise<void> {
    const [memberRole] = await this.db.query<{ id: string }>(
      `SELECT id FROM server_roles WHERE server_id=$1 AND name='Member' LIMIT 1`,
      [serverId],
    );
    if (!memberRole) return;
    await this.db.query(
      `INSERT INTO server_member_roles (server_id, user_id, role_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [serverId, userId, memberRole.id],
    );
  }

  async join(serverId: string, userId: string): Promise<{ ok: true }> {
    const [banned] = await this.db.query(
      'SELECT 1 FROM server_bans WHERE server_id=$1 AND user_id=$2',
      [serverId, userId],
    );
    if (banned) throw new ForbiddenException('You are banned from this server');

    await this.db.query(
      'INSERT INTO server_members (server_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [serverId, userId, 'member'],
    );
    await this.assignMemberRole(serverId, userId);
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
    await this.assignMemberRole(serverId, userId);
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

  async banMember(
    serverId: string,
    actorId: string,
    targetUserId: string,
    reason?: string,
  ) {
    await this.ensureMember(serverId, actorId);

    const [server] = await this.db.query<{ owner_id: string }>(
      'SELECT owner_id FROM servers WHERE id=$1',
      [serverId],
    );
    if (!server) throw new NotFoundException('Server not found');
    if (server.owner_id === targetUserId)
      throw new ForbiddenException('Cannot ban the server owner');
    if (actorId === targetUserId)
      throw new ForbiddenException('Cannot ban yourself');

    await this.rolesService.ensurePerm(serverId, actorId, PERMS.BAN_MEMBERS);

    // Remove from server
    await this.db.query(
      'DELETE FROM server_member_roles WHERE server_id=$1 AND user_id=$2',
      [serverId, targetUserId],
    );
    await this.db.query(
      'DELETE FROM server_members WHERE server_id=$1 AND user_id=$2',
      [serverId, targetUserId],
    );

    // Record ban
    await this.db.query(
      `INSERT INTO server_bans (server_id, user_id, banned_by, reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (server_id, user_id) DO UPDATE SET reason=EXCLUDED.reason, banned_by=EXCLUDED.banned_by`,
      [serverId, targetUserId, actorId, reason ?? null],
    );

    return { ok: true };
  }

  async unbanMember(serverId: string, actorId: string, targetUserId: string) {
    await this.rolesService.ensurePerm(serverId, actorId, PERMS.BAN_MEMBERS);
    await this.db.query(
      'DELETE FROM server_bans WHERE server_id=$1 AND user_id=$2',
      [serverId, targetUserId],
    );
    return { ok: true };
  }

  async listBans(serverId: string, actorId: string) {
    await this.ensureMember(serverId, actorId);
    return this.db.query<{
      user_id: string;
      username: string;
      reason: string | null;
      created_at: string;
    }>(
      `SELECT b.user_id, u.username, b.reason, b.created_at
         FROM server_bans b
         JOIN users u ON u.id = b.user_id
        WHERE b.server_id = $1
        ORDER BY b.created_at DESC`,
      [serverId],
    );
  }
}
