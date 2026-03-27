import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PgService } from '../db/pg.service';
import { ALL_PERMS, PERMS } from './permissions';

export type RoleRow = {
  id: string;
  server_id: string;
  name: string;
  color: string;
  permissions: number;
  position: number;
  created_at: string;
};

@Injectable()
export class RolesService {
  constructor(private db: PgService) {}

  async ensureOwner(serverId: string, userId: string) {
    const [s] = await this.db.query<{ owner_id: string }>(
      'SELECT owner_id FROM servers WHERE id=$1',
      [serverId],
    );
    if (!s) throw new NotFoundException('Server not found');
    if (s.owner_id !== userId) throw new ForbiddenException('Owner only');
  }

  async isOwner(serverId: string, userId: string): Promise<boolean> {
    const [s] = await this.db.query<{ owner_id: string }>(
      'SELECT owner_id FROM servers WHERE id=$1',
      [serverId],
    );
    return !!s && s.owner_id === userId;
  }

  async userPermsBitmask(serverId: string, userId: string): Promise<number> {
    if (await this.isOwner(serverId, userId)) return ALL_PERMS;

    const rows = await this.db.query<{ permissions: number }>(
      `SELECT r.permissions
         FROM server_roles r
         JOIN server_member_roles mr ON mr.role_id = r.id
        WHERE r.server_id = $1 AND mr.user_id = $2`,
      [serverId, userId],
    );

    let mask = 0;
    for (const row of rows) mask |= Number(row.permissions) || 0;
    return mask;
  }

  async ensurePerm(serverId: string, userId: string, permBit: number) {
    if (await this.isOwner(serverId, userId)) return;

    const mask = await this.userPermsBitmask(serverId, userId);
    if ((mask & permBit) === 0) {
      if (permBit === PERMS.MANAGE_ROLES) {
        throw new ForbiddenException('Missing permission: MANAGE_ROLES');
      }
      if (permBit === PERMS.MANAGE_CHANNELS) {
        throw new ForbiddenException('Missing permission: MANAGE_CHANNELS');
      }
      if (permBit === PERMS.SEND_MESSAGES) {
        throw new ForbiddenException('Missing permission: SEND_MESSAGES');
      }
      if (permBit === PERMS.CONNECT_VOICE) {
        throw new ForbiddenException('Missing permission: CONNECT_VOICE');
      }
      if (permBit === PERMS.KICK_MEMBERS) {
        throw new ForbiddenException('Missing permission: KICK_MEMBERS');
      }
      throw new ForbiddenException('Missing permission');
    }
  }

  async list(serverId: string): Promise<RoleRow[]> {
    return this.db.query<RoleRow>(
      'SELECT * FROM server_roles WHERE server_id=$1 ORDER BY position DESC, created_at ASC',
      [serverId],
    );
  }

  async create(
    serverId: string,
    name: string,
    color: string,
    permissions: number,
    userId: string,
  ): Promise<RoleRow> {
    await this.ensurePerm(serverId, userId, PERMS.MANAGE_ROLES);

    const [row] = await this.db.query<{ max: number }>(
      'SELECT COALESCE(MAX(position),0) as max FROM server_roles WHERE server_id=$1',
      [serverId],
    );
    const position = (row?.max ?? 0) + 1;

    const [r] = await this.db.query<RoleRow>(
      `INSERT INTO server_roles (server_id, name, color, permissions, position)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [serverId, name, color, permissions, position],
    );
    return r;
  }

  async update(
    roleId: string,
    patch: Partial<
      Pick<RoleRow, 'name' | 'color' | 'permissions' | 'position'>
    >,
    userId: string,
  ): Promise<RoleRow> {
    const [r] = await this.db.query<RoleRow>(
      'SELECT * FROM server_roles WHERE id=$1',
      [roleId],
    );
    if (!r) throw new NotFoundException('Role not found');

    await this.ensurePerm(r.server_id, userId, PERMS.MANAGE_ROLES);

    const next = {
      name: patch.name ?? r.name,
      color: patch.color ?? r.color,
      permissions: patch.permissions ?? r.permissions,
      position: patch.position ?? r.position,
    };

    const [u] = await this.db.query<RoleRow>(
      `UPDATE server_roles
          SET name=$2, color=$3, permissions=$4, position=$5
        WHERE id=$1
      RETURNING *`,
      [roleId, next.name, next.color, next.permissions, next.position],
    );
    return u;
  }

  async delete(roleId: string, userId: string): Promise<{ ok: true }> {
    const [r] = await this.db.query<RoleRow>(
      'SELECT * FROM server_roles WHERE id=$1',
      [roleId],
    );
    if (!r) throw new NotFoundException('Role not found');

    await this.ensurePerm(r.server_id, userId, PERMS.MANAGE_ROLES);

    await this.db.query('DELETE FROM server_member_roles WHERE role_id=$1', [
      roleId,
    ]);
    await this.db.query('DELETE FROM server_roles WHERE id=$1', [roleId]);
    return { ok: true };
  }

  async assign(
    serverId: string,
    userIdToAssign: string,
    roleId: string,
    actorUserId: string,
  ): Promise<{ ok: true }> {
    const [r] = await this.db.query<RoleRow>(
      'SELECT * FROM server_roles WHERE id=$1',
      [roleId],
    );
    if (!r || r.server_id !== serverId)
      throw new NotFoundException('Role not found');

    await this.ensurePerm(serverId, actorUserId, PERMS.MANAGE_ROLES);

    await this.db.query(
      `INSERT INTO server_member_roles (server_id, user_id, role_id)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [serverId, userIdToAssign, roleId],
    );
    return { ok: true };
  }

  async unassign(
    serverId: string,
    userIdToRemove: string,
    roleId: string,
    actorUserId: string,
  ): Promise<{ ok: true }> {
    const [r] = await this.db.query<RoleRow>(
      'SELECT * FROM server_roles WHERE id=$1',
      [roleId],
    );
    if (!r || r.server_id !== serverId)
      throw new NotFoundException('Role not found');

    await this.ensurePerm(serverId, actorUserId, PERMS.MANAGE_ROLES);

    await this.db.query(
      `DELETE FROM server_member_roles
        WHERE server_id=$1 AND user_id=$2 AND role_id=$3`,
      [serverId, userIdToRemove, roleId],
    );
    return { ok: true };
  }

  async rolesOfUser(serverId: string, userId: string): Promise<RoleRow[]> {
    return this.db.query<RoleRow>(
      `SELECT r.*
         FROM server_roles r
         JOIN server_member_roles mr ON mr.role_id = r.id
        WHERE r.server_id=$1 AND mr.user_id=$2
        ORDER BY r.position DESC, r.created_at ASC`,
      [serverId, userId],
    );
  }
}
