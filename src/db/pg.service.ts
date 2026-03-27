import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, Client } from 'pg';
import { config } from '../config';

type NotifyHandler = (channel: string, payload: string) => void;

@Injectable()
export class PgService implements OnModuleInit, OnModuleDestroy {
  private pool = new Pool({ connectionString: config.databaseUrl });
  private listener = new Client({ connectionString: config.databaseUrl });
  private handlers: NotifyHandler[] = [];

  async onModuleInit() {
    await this.listener.connect();
    this.listener.on('notification', (msg) => {
      this.handlers.forEach((h) => h(msg.channel, msg.payload || ''));
    });
    await this.listener.query('LISTEN message_inserted');
  }

  onModuleDestroy() {
    void this.pool.end();
    void this.listener.end();
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const res = await this.pool.query(text, params);
    return res.rows as T[];
  }

  onNotify(handler: NotifyHandler) {
    this.handlers.push(handler);
  }
}
