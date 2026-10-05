import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StorageService } from '../storage/storage.service';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
    private readonly storageService: StorageService,
  ) {}

  async createMessage(data: {
    senderId: string;
    receiverId: string;
    text?: string;
    imageId?: string;
  }) {
    if (!Types.ObjectId.isValid(data.senderId)) {
      throw new BadRequestException('Sender ID is invalid');
    }

    if (!Types.ObjectId.isValid(data.receiverId)) {
      throw new BadRequestException('Receiver ID is invalid');
    }

    if (data.senderId === data.receiverId) {
      throw new BadRequestException('You cannot message yourself');
    }

    const text = data.text?.trim() || '';
    const imageId =
      data.imageId && Types.ObjectId.isValid(data.imageId)
        ? new Types.ObjectId(data.imageId)
        : null;

    if (!text && !imageId) {
      throw new BadRequestException(
        'Message must contain text, an image, or both',
      );
    }

    const message = await this.messageModel.create({
      sender: new Types.ObjectId(data.senderId),
      receiver: new Types.ObjectId(data.receiverId),
      text,
      imageId,
      isRead: false,
    });

    const savedMessage = await this.messageModel
      .findById(message._id)
      .populate('sender', 'username')
      .populate('receiver', 'username')
      .populate('imageId');
    return this.withSignedImageUrl(savedMessage);
  }

  async getConversation(userA: string, userB: string) {
    if (!Types.ObjectId.isValid(userA)) {
      throw new BadRequestException('User A ID is invalid');
    }

    if (!Types.ObjectId.isValid(userB)) {
      throw new BadRequestException('User B ID is invalid');
    }

    const messages = await this.messageModel
      .find({
        $or: [
          { sender: new Types.ObjectId(userA), receiver: new Types.ObjectId(userB) },
          { sender: new Types.ObjectId(userB), receiver: new Types.ObjectId(userA) },
        ],
      })
      .sort({ createdAt: 1 })
      .populate('sender', 'username')
      .populate('receiver', 'username')
      .populate('imageId');

    return Promise.all(messages.map((message) => this.withSignedImageUrl(message)));
  }

  async getUserChats(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID is invalid');
    }

    const objectId = new Types.ObjectId(userId);

    const messages = await this.messageModel
      .find({
        $or: [{ sender: objectId }, { receiver: objectId }],
      })
      .sort({ createdAt: -1 })
      .populate('sender', 'username email')
      .populate('receiver', 'username email')
      .populate('imageId');

    const conversations = new Map<string, any>();

    for (const message of messages) {
      const senderId = String((message.sender as any)?._id ?? message.sender);
      const receiverId = String((message.receiver as any)?._id ?? message.receiver);
      const peerId = senderId === userId ? receiverId : senderId;
      if (!conversations.has(peerId)) {
        conversations.set(peerId, message);
      }
    }

    return Promise.all(
      Array.from(conversations.values()).map((message) =>
        this.withSignedImageUrl(message),
      ),
    );
  }

  private async withSignedImageUrl(message: MessageDocument | null) {
    if (!message) return message;

    const populatedImage = message.imageId as unknown as {
      originalKey?: string;
      toObject: () => Record<string, unknown>;
    } | null;
    const imageId = populatedImage?.originalKey
      ? {
          ...populatedImage.toObject(),
          url: await this.storageService.getSignedUrl(populatedImage.originalKey),
        }
      : message.imageId;

    return {
      ...message.toObject(),
      imageId,
    };
  }

  async markConversationAsRead(currentUserId: string, otherUserId: string) {
    if (!Types.ObjectId.isValid(currentUserId)) {
      throw new BadRequestException('Current user ID is invalid');
    }

    if (!Types.ObjectId.isValid(otherUserId)) {
      throw new BadRequestException('Other user ID is invalid');
    }

    const readAt = new Date();
    const result = await this.messageModel.updateMany(
      {
        sender: new Types.ObjectId(otherUserId),
        receiver: new Types.ObjectId(currentUserId),
        isRead: false,
      },
      { $set: { isRead: true, readAt } },
    );

    return {
      modifiedCount: result.modifiedCount,
      readAt,
    };
  }
}
