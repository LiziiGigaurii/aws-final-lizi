import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversation/:userId')
  async getConversation(@Req() req: any, @Param('userId') userId: string) {
    return this.chatService.getConversation(req.userId, userId);
  }

  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.chatService.getUserChats(req.userId);
  }
}
