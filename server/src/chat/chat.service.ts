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
    imageVersionId?: string;
    images?: { imageId: string; imageVersionId?: string }[];
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
    if (data.imageId && !Types.ObjectId.isValid(data.imageId)) {
      throw new BadRequestException('Image ID is invalid');
    }
    if (
      data.images?.length &&
      (data.images.length > 10 ||
        data.images.some((image) => !Types.ObjectId.isValid(image.imageId)))
    ) {
      throw new BadRequestException('Image attachments are invalid');
    }
    const imageId = data.imageId ? new Types.ObjectId(data.imageId) : null;
    const images = (data.images || []).map((image) => ({
      imageId: new Types.ObjectId(image.imageId),
      imageVersionId: image.imageVersionId || null,
    }));

    if (data.imageVersionId && !imageId) {
      throw new BadRequestException('An image version requires an image');
    }

    if (!text && !imageId && images.length === 0) {
      throw new BadRequestException(
        'Message must contain text, an image, or both',
      );
    }

    const message = await this.messageModel.create({
      sender: new Types.ObjectId(data.senderId),
      receiver: new Types.ObjectId(data.receiverId),
      text,
      imageId,
      imageVersionId: data.imageVersionId || null,
      images,
      isRead: false,
    });

    const savedMessage = await this.messageModel
      .findById(message._id)
      .populate('sender', 'username')
      .populate('receiver', 'username')
      .populate('imageId')
      .populate('images.imageId');
    const populatedImage = savedMessage?.imageId as unknown as {
      originalKey?: string;
      transformedKeys?: string[];
      transformHistory?: { id: string; key: string }[];
    } | null;
    const populatedAttachments = savedMessage?.images as unknown as {
      imageId?: {
        originalKey?: string;
        transformedKeys?: string[];
        transformHistory?: { id: string; key: string }[];
      } | null;
      imageVersionId?: string | null;
    }[] | undefined;
    if (
      (imageId &&
        (!populatedImage ||
        (data.imageVersionId &&
          data.imageVersionId !== 'original' &&
          !this.getImageVersionKey(populatedImage, data.imageVersionId)))) ||
      (images.length > 0 &&
        (populatedAttachments?.length !== images.length ||
          populatedAttachments.some(
            (attachment) =>
              !attachment.imageId?.originalKey ||
              (attachment.imageVersionId &&
                attachment.imageVersionId !== 'original' &&
                !this.getImageVersionKey(
                  attachment.imageId,
                  attachment.imageVersionId,
                )),
          )))
    ) {
      await this.messageModel.deleteOne({ _id: message._id });
      throw new NotFoundException('Image or image version not found');
    }
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
      .populate('imageId')
      .populate('images.imageId');

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
      .populate('imageId')
      .populate('images.imageId');

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
      Array.from(conversations.entries()).map(async ([peerId, message]) => {
        const unreadCount = await this.messageModel.countDocuments({
          sender: new Types.ObjectId(peerId),
          receiver: objectId,
          isRead: false,
        });
        return {
          ...(await this.withSignedImageUrl(message))!,
          unreadCount,
        };
      }),
    );
  }

  async getMessageImageForUser(
    messageId: string,
    userId: string,
    imageIndex = 0,
  ) {
    if (!Types.ObjectId.isValid(messageId) || !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Message or user ID is invalid');
    }
    if (!Number.isInteger(imageIndex) || imageIndex < 0) {
      throw new BadRequestException('Image index is invalid');
    }

    const message = await this.messageModel
      .findById(messageId)
      .populate('imageId')
      .populate('images.imageId');
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const senderId = String(message.sender);
    const receiverId = String(message.receiver);
    if (senderId !== userId && receiverId !== userId) {
      throw new NotFoundException('Message not found');
    }

    const imageAttachments = message.images?.length
      ? (message.images as unknown as {
          imageId: unknown;
          imageVersionId?: string | null;
        }[])
      : message.imageId
        ? [{ imageId: message.imageId, imageVersionId: message.imageVersionId }]
        : [];
    const attachment = imageAttachments[imageIndex];
    const image = attachment?.imageId as unknown as {
      originalKey?: string;
      format?: string;
      transformHistory?: {
        id: string;
        key: string;
        metadata?: { format?: string };
      }[];
      transformedKeys?: string[];
    } | null;
    if (!image?.originalKey) {
      throw new NotFoundException('Shared photo not found');
    }

    const versionId = attachment.imageVersionId || undefined;
    const selectedKey = this.getImageVersionKey(image, versionId);
    if (versionId && versionId !== 'original' && !selectedKey) {
      throw new NotFoundException('Shared photo version not found');
    }

    const format =
      image.transformHistory?.find((version) => version.id === versionId)?.metadata
        ?.format ?? image.format ?? 'jpeg';
    const normalizedFormat = format === 'jpg' ? 'jpeg' : format;
    const extension = normalizedFormat === 'jpeg' ? 'jpg' : normalizedFormat;

    return {
      buffer: await this.storageService.downloadFile(
        selectedKey || image.originalKey,
      ),
      mimeType: `image/${normalizedFormat}`,
      fileName: `framehouse-${messageId}-${imageIndex + 1}.${extension}`,
    };
  }

  private async withSignedImageUrl(message: MessageDocument | null) {
    if (!message) return message;

    const populatedImage = message.imageId as unknown as {
      originalKey?: string;
      transformedKeys?: string[];
      transformHistory?: { id: string; key: string }[];
      toObject: () => Record<string, unknown>;
    } | null;
    const selectedKey = populatedImage
      ? this.getImageVersionKey(populatedImage, message.imageVersionId || undefined)
      : undefined;
    const imageKey = selectedKey || populatedImage?.originalKey;
    const imageId = imageKey && populatedImage
      ? {
          ...populatedImage.toObject(),
          url: await this.storageService.getSignedUrl(imageKey),
        }
      : message.imageId;
    const populatedAttachments = (message.images || []) as unknown as {
      imageId: {
        originalKey?: string;
        transformedKeys?: string[];
        transformHistory?: { id: string; key: string }[];
        toObject?: () => Record<string, unknown>;
      };
      imageVersionId?: string | null;
      toObject?: () => Record<string, unknown>;
    }[];
    const images = await Promise.all(
      populatedAttachments.map(async (attachment) => {
        const attachmentImage = attachment.imageId;
        const attachmentKey = this.getImageVersionKey(
          attachmentImage,
          attachment.imageVersionId || undefined,
        ) || attachmentImage?.originalKey;
        return {
          ...(attachment.toObject?.() || attachment),
          imageId:
            attachmentKey && attachmentImage?.toObject
              ? {
                  ...attachmentImage.toObject(),
                  url: await this.storageService.getSignedUrl(attachmentKey),
                }
              : attachment.imageId,
        };
      }),
    );

    return {
      ...message.toObject(),
      imageId,
      images,
    };
  }

  private getImageVersionKey(
    image: {
      transformedKeys?: string[];
      transformHistory?: { id: string; key: string }[];
    },
    versionId?: string,
  ) {
    if (!versionId || versionId === 'original') return undefined;

    const version = image.transformHistory?.find((item) => item.id === versionId);
    if (version?.key) return version.key;

    const legacyMatch = /^legacy-(\d+)$/.exec(versionId);
    return legacyMatch
      ? image.transformedKeys?.[Number(legacyMatch[1]) - 1]
      : undefined;
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
