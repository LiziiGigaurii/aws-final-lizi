import {
  Controller,
  Get,
  Patch,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('conversation/:userId')
  async getConversation(@Req() req: any, @Param('userId') userId: string) {
    return this.chatService.getConversation(req.userId, userId);
  }

  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.chatService.getUserChats(req.userId);
  }

  @Patch('conversation/:userId/read')
  async markConversationAsRead(@Req() req: any, @Param('userId') userId: string) {
    const result = await this.chatService.markConversationAsRead(req.userId, userId);
    if (result.modifiedCount > 0) {
      this.chatGateway.emitReadReceipt(userId, req.userId, result.readAt);
    }
    return result;
  }
}
