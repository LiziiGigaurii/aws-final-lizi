import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

const socketOrigins = process.env.CLIENT_URL
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean) ?? ['http://localhost:3000', 'http://127.0.0.1:3000'];

@WebSocketGateway({
  cors: {
    origin: socketOrigins,
  },
})
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ userId?: string }>(token);
      if (!payload.userId) {
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.userId;
      await client.join(`user:${payload.userId}`);
      client.emit('authenticated', {
        status: 'joined',
        userId: payload.userId,
      });
      this.logger.log(`Authenticated client connected: ${client.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitReadReceipt(recipientId: string, readerId: string, readAt: Date) {
    this.server.to(`user:${recipientId}`).emit('messages-read', {
      readerId,
      readAt,
    });
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      senderId: string;
      receiverId: string;
      text?: string;
      imageId?: string;
      imageVersionId?: string;
    },
  ) {
    const joinedUserId = client.data.userId as string | undefined;
    if (!joinedUserId) {
      return {
        status: 'error',
        message: 'Join your user room before sending messages',
      };
    }

    if (!payload?.senderId || !payload?.receiverId) {
      return {
        status: 'error',
        message: 'senderId and receiverId are required',
      };
    }

    if (payload.senderId !== joinedUserId) {
      return {
        status: 'error',
        message: 'Sender does not match the connected user',
      };
    }

    try {
      const message = await this.chatService.createMessage(payload);

      this.server.to(`user:${joinedUserId}`).emit('new-message', message);
      this.server.to(`user:${payload.receiverId}`).emit('new-message', message);

      return {
        status: 'success',
        message,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Message could not be sent',
      };
    }
  }
}
