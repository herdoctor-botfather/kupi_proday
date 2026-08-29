import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  sendMessageSchema,
  startConversationSchema,
  type ChatMessage,
  type ConversationSummary,
  type ConversationThread,
  type SendMessageDto,
  type StartConversationDto,
} from '@app/shared';
import { ChatService } from './chat.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, type RequestUser } from '../common/current-user.decorator';

/** Переписка внутри приложения. Доступна только участникам диалога. */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  findConversations(@CurrentUser() user: RequestUser): Promise<ConversationSummary[]> {
    return this.chat.findConversations(user.id);
  }

  /** Счётчик для значка на вкладке. Отдельный лёгкий запрос. */
  @Get('unread')
  async countUnread(@CurrentUser() user: RequestUser): Promise<{ count: number }> {
    return { count: await this.chat.countUnread(user.id) };
  }

  @Post('conversations')
  start(
    @Body(new ZodValidationPipe(startConversationSchema)) dto: StartConversationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ConversationSummary> {
    return this.chat.startConversation(user.id, dto);
  }

  @Get('conversations/:id')
  findThread(
    @Param('id') id: string,
    @Query('before') before: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<ConversationThread> {
    return this.chat.findThread(user.id, id, before);
  }

  @Post('conversations/:id/messages')
  send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ChatMessage> {
    return this.chat.sendMessage(user.id, id, dto.text);
  }
}
