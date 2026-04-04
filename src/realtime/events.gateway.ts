import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { config } from '../config';
import * as jwt from 'jsonwebtoken';
import { PgService } from '../db/pg.service';
import { PresenceService } from '../presence/presence.service';
import { RolesService } from '../roles/roles.service';
import { PERMS } from '../roles/permissions';
import { MessagesService } from '../messages/messages.service';
import { DmService } from '../dm/dm.service';

type AuthedSocket = Socket & { user?: { id: string; username: string } };

type VoiceMember = {
  socketId: string;
  userId: string;
  username: string;
  channelId: string;
  serverId: string;
  speaking: boolean;
  muted: boolean;
};

@WebSocketGateway({
  cors: { origin: config.corsOrigin || '*' },
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() io!: Server;

  private voiceMembers = new Map<string, VoiceMember>();

  constructor(
    private db: PgService,
    private presence: PresenceService,
    private roles: RolesService,
    private messages: MessagesService,
    private dmService: DmService,
  ) {}

  afterInit() {
    this.db.onNotify((channel, payload) => {
      if (channel !== 'message_inserted') return;
      try {
        const data = JSON.parse(payload);
        const { message } = data;
        void this.emitMessageNew(message);
      } catch {
        // ignore malformed payloads
      }
    });
  }

  private roomForChannel(channelId: string) {
    return `channel:${channelId}`;
  }

  private roomForPresence(serverId: string) {
    return `presence:${serverId}`;
  }

  private roomForVoice(channelId: string) {
    return `voice:${channelId}`;
  }

  private async getServerIdForChannel(
    channelId: string,
  ): Promise<string | null> {
    const [row] = await this.db.query<{ server_id: string }>(
      'SELECT server_id FROM channels WHERE id = $1',
      [channelId],
    );
    return row?.server_id ?? null;
  }

  private getVoiceMembersForChannel(channelId: string) {
    return Array.from(this.voiceMembers.values())
      .filter((m) => m.channelId === channelId)
      .map((m) => ({
        socketId: m.socketId,
        userId: m.userId,
        username: m.username,
        channelId: m.channelId,
        speaking: m.speaking,
        muted: m.muted,
      }));
  }

  private emitVoiceMembers(channelId: string, serverId: string) {
    const payload = {
      channelId,
      members: this.getVoiceMembersForChannel(channelId),
    };

    this.io.to(this.roomForVoice(channelId)).emit('voice:members', payload);
    this.io.to(this.roomForPresence(serverId)).emit('voice:members', payload);
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);

      if (!token) return client.disconnect(true);

      const decoded = jwt.verify(token, config.jwtSecret) as any;
      client.user = { id: decoded.sub, username: decoded.username };

      this.presence.userConnected(client.user.id, client.id);
      client.join(`user:${client.user.id}`);

      const sv = await this.db.query<{ server_id: string }>(
        'SELECT server_id FROM server_members WHERE user_id = $1',
        [client.user.id],
      );

      const serverIds = sv.map((r) => r.server_id);
      serverIds.forEach((sid) => client.join(this.roomForPresence(sid)));

      for (const sid of serverIds) {
        const online = await this.presence.onlineForServer(sid);
        this.io
          .to(this.roomForPresence(sid))
          .emit('presence:update', { serverId: sid, online });
      }

      client.on('channel:subscribe', ({ channelId }) => {
        if (!channelId) return;
        client.join(this.roomForChannel(channelId));
        client.emit('subscribed', { channelId });
      });

      client.on('channel:unsubscribe', ({ channelId }) => {
        if (!channelId) return;
        client.leave(this.roomForChannel(channelId));
        client.emit('unsubscribed', { channelId });
      });

      client.on('message:send', async ({ channelId, content }, cb) => {
        try {
          const msg = await this.messages.send(
            channelId,
            client.user!.id,
            content,
          );
          cb?.({ ok: true, id: msg.id });
        } catch (e: any) {
          cb?.({ ok: false, error: e?.message || 'Unable to send message' });
        }
      });

      client.on('voice:join', async ({ channelId }, cb) => {
        try {
          if (!channelId || !client.user) {
            cb?.({ ok: false, error: 'Missing channelId or user' });
            return;
          }

          const serverId = await this.getServerIdForChannel(channelId);
          if (!serverId) {
            cb?.({ ok: false, error: 'Channel not found' });
            return;
          }

          const existing = this.voiceMembers.get(client.id);
          if (existing) {
            client.leave(this.roomForVoice(existing.channelId));
            this.voiceMembers.delete(client.id);

            this.io
              .to(this.roomForVoice(existing.channelId))
              .emit('voice:user-left', {
                socketId: client.id,
                userId: existing.userId,
                username: existing.username,
                channelId: existing.channelId,
              });

            this.emitVoiceMembers(existing.channelId, existing.serverId);
          }

          client.join(this.roomForVoice(channelId));

          const member: VoiceMember = {
            socketId: client.id,
            userId: client.user.id,
            username: client.user.username,
            channelId,
            serverId,
            speaking: false,
            muted: false,
          };

          this.voiceMembers.set(client.id, member);

          client.to(this.roomForVoice(channelId)).emit('voice:user-joined', {
            socketId: client.id,
            userId: client.user.id,
            username: client.user.username,
            channelId,
          });

          this.emitVoiceMembers(channelId, serverId);
          cb?.({ ok: true });
        } catch (e: any) {
          cb?.({ ok: false, error: e?.message || 'Unable to join voice' });
        }
      });

      client.on('voice:leave', ({ channelId }) => {
        if (!channelId) return;

        const existing = this.voiceMembers.get(client.id);
        if (!existing || existing.channelId !== channelId) return;

        client.leave(this.roomForVoice(channelId));
        this.voiceMembers.delete(client.id);

        client.to(this.roomForVoice(channelId)).emit('voice:user-left', {
          socketId: client.id,
          userId: existing.userId,
          username: existing.username,
          channelId,
        });

        this.emitVoiceMembers(channelId, existing.serverId);
      });

      client.on('voice:speaking', ({ channelId, speaking }) => {
        const existing = this.voiceMembers.get(client.id);
        if (!existing) return;
        if (existing.channelId !== channelId) return;

        existing.speaking = !!speaking && !existing.muted;
        this.voiceMembers.set(client.id, existing);

        const payload = {
          channelId,
          socketId: client.id,
          userId: existing.userId,
          username: existing.username,
          speaking: existing.speaking,
        };

        this.io
          .to(this.roomForVoice(channelId))
          .emit('voice:speaking', payload);
        this.io
          .to(this.roomForPresence(existing.serverId))
          .emit('voice:speaking', payload);
      });

      client.on('voice:mute', ({ channelId, muted }) => {
        const existing = this.voiceMembers.get(client.id);
        if (!existing) return;
        if (existing.channelId !== channelId) return;

        existing.muted = !!muted;
        if (existing.muted) existing.speaking = false;
        this.voiceMembers.set(client.id, existing);

        const mutePayload = {
          channelId,
          socketId: client.id,
          userId: existing.userId,
          username: existing.username,
          muted: existing.muted,
        };

        this.io
          .to(this.roomForVoice(channelId))
          .emit('voice:mute', mutePayload);
        this.io
          .to(this.roomForPresence(existing.serverId))
          .emit('voice:mute', mutePayload);

        if (existing.muted) {
          const speakingPayload = {
            channelId,
            socketId: client.id,
            userId: existing.userId,
            username: existing.username,
            speaking: false,
          };

          this.io
            .to(this.roomForVoice(channelId))
            .emit('voice:speaking', speakingPayload);

          this.io
            .to(this.roomForPresence(existing.serverId))
            .emit('voice:speaking', speakingPayload);
        }

        this.emitVoiceMembers(channelId, existing.serverId);
      });

      client.on(
        'voice:force-disconnect',
        async ({ serverId, targetUserId }, cb) => {
          try {
            if (!client.user || !serverId || !targetUserId) {
              cb?.({ ok: false, error: 'Missing data' });
              return;
            }

            await this.roles.ensurePerm(
              serverId,
              client.user.id,
              PERMS.KICK_MEMBERS,
            );

            const targets = Array.from(this.voiceMembers.values()).filter(
              (m) => m.userId === targetUserId && m.serverId === serverId,
            );

            for (const target of targets) {
              const sock = this.io.sockets.sockets.get(target.socketId);
              if (sock) {
                sock.emit('voice:disconnect', {
                  channelId: target.channelId,
                  reason: 'Disconnected by moderator',
                });
                sock.leave(this.roomForVoice(target.channelId));
              }

              this.voiceMembers.delete(target.socketId);

              this.io
                .to(this.roomForVoice(target.channelId))
                .emit('voice:user-left', {
                  socketId: target.socketId,
                  userId: target.userId,
                  username: target.username,
                  channelId: target.channelId,
                });

              this.emitVoiceMembers(target.channelId, target.serverId);
            }

            cb?.({ ok: true });
          } catch (e: any) {
            cb?.({
              ok: false,
              error: e?.message || 'Unable to disconnect user',
            });
          }
        },
      );

      client.on('voice:offer', ({ to, sdp }) => {
        this.io.to(to).emit('voice:offer', { from: client.id, sdp });
      });

      client.on('voice:answer', ({ to, sdp }) => {
        this.io.to(to).emit('voice:answer', { from: client.id, sdp });
      });

      client.on('voice:candidate', ({ to, candidate }) => {
        this.io.to(to).emit('voice:candidate', { from: client.id, candidate });
      });

      // ── DM ──────────────────────────────────────────────────────────────
      client.on('dm:subscribe', ({ channelId }) => {
        if (!channelId) return;
        void client.join(`dm:${channelId}`);
      });

      client.on('dm:unsubscribe', ({ channelId }) => {
        if (!channelId) return;
        void client.leave(`dm:${channelId}`);
      });

      client.on('dm:send', async ({ channelId, content }, cb) => {
        try {
          if (!client.user) { cb?.({ ok: false, error: 'Not authenticated' }); return; }
          const msg = await this.dmService.sendMessage(channelId, client.user.id, content);
          client.to(`dm:${channelId}`).emit('dm:new', msg);
          const ch = await this.dmService.getChannelUsers(channelId);
          if (ch) {
            const otherId = ch.user1_id === client.user.id ? ch.user2_id : ch.user1_id;
            this.io.to(`user:${otherId}`).emit('dm:notify', { channelId, from: client.user.username });
          }
          cb?.({ ok: true, msg });
        } catch (e: any) {
          cb?.({ ok: false, error: e?.message || 'Unable to send DM' });
        }
      });

      // ── Screen sharing ───────────────────────────────────────────────────
      client.on('screen:start', ({ channelId }) => {
        const member = this.voiceMembers.get(client.id);
        if (!member || member.channelId !== channelId) return;
        client.to(this.roomForVoice(channelId)).emit('screen:start', {
          socketId: client.id,
          userId: member.userId,
          username: member.username,
          channelId,
        });
        this.io.to(this.roomForPresence(member.serverId)).emit('screen:start', {
          socketId: client.id,
          userId: member.userId,
          username: member.username,
          channelId,
        });
      });

      client.on('screen:stop', ({ channelId }) => {
        const member = this.voiceMembers.get(client.id);
        if (!member) return;
        client.to(this.roomForVoice(channelId)).emit('screen:stop', {
          socketId: client.id,
          userId: member.userId,
          username: member.username,
          channelId,
        });
        this.io.to(this.roomForPresence(member.serverId)).emit('screen:stop', {
          socketId: client.id,
          userId: member.userId,
          username: member.username,
          channelId,
        });
      });

      client.on('screen:offer', ({ to, sdp }) => {
        this.io.to(to).emit('screen:offer', { from: client.id, sdp });
      });

      client.on('screen:answer', ({ to, sdp }) => {
        this.io.to(to).emit('screen:answer', { from: client.id, sdp });
      });

      client.on('screen:candidate', ({ to, candidate }) => {
        this.io.to(to).emit('screen:candidate', { from: client.id, candidate });
      });

      client.emit('connected', { ok: true });
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    this.presence.userDisconnected(client.id);

    try {
      if (!client.user) return;

      const sv = await this.db.query<{ server_id: string }>(
        'SELECT server_id FROM server_members WHERE user_id = $1',
        [client.user.id],
      );

      for (const { server_id } of sv) {
        const online = await this.presence.onlineForServer(server_id);
        this.io
          .to(this.roomForPresence(server_id))
          .emit('presence:update', { serverId: server_id, online });
      }
    } catch {
      // ignore
    }

    const existing = this.voiceMembers.get(client.id);
    if (existing) {
      this.voiceMembers.delete(client.id);

      client.to(this.roomForVoice(existing.channelId)).emit('voice:user-left', {
        socketId: client.id,
        userId: existing.userId,
        username: existing.username,
        channelId: existing.channelId,
      });

      this.emitVoiceMembers(existing.channelId, existing.serverId);
    }
  }

  async emitMessageNew(msg: any) {
    let enriched = msg;

    if (!('username' in msg) || !('user_color' in msg)) {
      const [u] = await this.db.query<{
        username: string;
        display_color: string | null;
      }>('SELECT username, display_color FROM users WHERE id = $1', [
        msg.user_id,
      ]);

      if (u) {
        enriched = {
          ...msg,
          username: u.username,
          user_color: u.display_color,
        };
      }
    }

    this.io
      .to(this.roomForChannel(enriched.channel_id))
      .emit('message:new', enriched);
  }
}
