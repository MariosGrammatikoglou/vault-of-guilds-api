import { Injectable } from '@nestjs/common';
import { PgService } from '../db/pg.service';
import * as bcrypt from 'bcrypt';

export type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  display_color: string | null;
};

@Injectable()
export class UsersService {
  constructor(private db: PgService) {}

  async findByUsername(username: string): Promise<UserRow | null> {
    const [u] = await this.db.query<UserRow>('SELECT * FROM users WHERE username=$1', [username]);
    return u || null;
  }

  async findById(
    id: string,
  ): Promise<{ id: string; username: string; display_color: string | null } | null> {
    const [u] = await this.db.query<UserRow>('SELECT * FROM users WHERE id=$1', [id]);
    if (!u) return null;
    const { password_hash, ...rest } = u;
    return rest;
  }

  async create(username: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    const [u] = await this.db.query<UserRow>(
      'INSERT INTO users (username, password_hash) VALUES ($1,$2) RETURNING *',
      [username, hash],
    );
    return u;
  }

  async validate(username: string, password: string): Promise<UserRow | null> {
    const u = await this.findByUsername(username);
    if (!u) return null;
    const ok = await bcrypt.compare(password, u.password_hash);
    return ok ? u : null;
  }

  async updateDisplayColor(
    userId: string,
    color: string | null,
  ): Promise<{ id: string; username: string; display_color: string | null } | null> {
    const [u] = await this.db.query<UserRow>(
      'UPDATE users SET display_color=$2 WHERE id=$1 RETURNING *',
      [userId, color],
    );
    if (!u) return null;
    const { password_hash, ...rest } = u;
    return rest;
  }
}
