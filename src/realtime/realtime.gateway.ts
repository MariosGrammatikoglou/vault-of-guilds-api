import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN || '*' },
})
export class RealtimeGateway {
  @WebSocketServer() server!: Server;

  // Client asks to get events for a channel
  @SubscribeMessage('channel:subscribe')
  handleSubscribe(@MessageBody() data: { channelId: string }, @ConnectedSocket() client: Socket) {
    const { channelId } = data || {};
    if (!channelId) return;
    client.join(`ch:${channelId}`);
    client.emit('subscribed', { channelId });
  }

  // Client leaves channel room
  @SubscribeMessage('channel:unsubscribe')
  handleUnsubscribe(@MessageBody() data: { channelId: string }, @ConnectedSocket() client: Socket) {
    const { channelId } = data || {};
    if (!channelId) return;
    client.leave(`ch:${channelId}`);
    client.emit('unsubscribed', { channelId });
  }

  // Helper: broadcast a newly-created message to everyone in that channel
  emitMessageNew(msg: any) {
    this.server.to(`ch:${msg.channel_id}`).emit('message:new', msg);
  }
}
