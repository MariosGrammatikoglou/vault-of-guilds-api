import {
  WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { PresenceService } from './presence.service';

type AuthedSocket = Socket & { user?: { id: string; username: string }; subs?: Set<string> };

@WebSocketGateway({
  cors: { origin: config.corsOrigin || '*' },
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() io!: Server;

  constructor(private presence: PresenceService) {}

  async handleConnection(client: AuthedSocket) {
    try {
      const token = (client.handshake.auth?.token || client.handshake.query?.token) as string | undefined;
      if (!token) return client.disconnect();
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      client.user = { id: decoded.sub, username: decoded.username };
      client.subs = new Set();
      this.presence.userConnected(client.user.id, client.id);
      // no broadcast yet — wait until someone subscribes a server room
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    const prevSubs = client.subs ? [...client.subs] : [];
    this.presence.userDisconnected(client.id);
    // For each subscribed server, push new presence list
    for (const serverId of prevSubs) {
      const online = await this.presence.onlineForServer(serverId);
      this.io.to(`presence:${serverId}`).emit('presence:update', { serverId, online });
    }
  }

  @SubscribeMessage('presence:subscribe')
  async handleSubscribe(
    @MessageBody() data: { serverId: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const { serverId } = data || {};
    if (!serverId || !client.user) return;
    const room = `presence:${serverId}`;
    client.join(room);
    client.subs?.add(serverId);
    // send initial list immediately to this client
    const online = await this.presence.onlineForServer(serverId);
    client.emit('presence:update', { serverId, online });
  }

  @SubscribeMessage('presence:unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { serverId: string },
    @ConnectedSocket() client: AuthedSocket,
  ) {
    const { serverId } = data || {};
    if (!serverId) return;
    const room = `presence:${serverId}`;
    client.leave(room);
    client.subs?.delete(serverId);
  }
}
