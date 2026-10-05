import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string },
  ) {
    if (!payload?.userId) {
      return { status: 'error', message: 'userId is required' };
    }

    client.join(`user:${payload.userId}`);
    client.data.userId = payload.userId;

    return {
      status: 'joined',
      room: `user:${payload.userId}`,
    };
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
    },
  ) {
    if (!payload?.senderId || !payload?.receiverId) {
      return {
        status: 'error',
        message: 'senderId and receiverId are required',
      };
    }

    const message = await this.chatService.createMessage(payload);

    this.server.to(`user:${payload.senderId}`).emit('new-message', message);
    this.server.to(`user:${payload.receiverId}`).emit('new-message', message);

    return {
      status: 'success',
      message,
    };
  }
}
