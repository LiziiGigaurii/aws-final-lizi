import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Image } from '../../images/schemas/images.schema';
import { User } from '../../users/schemas/user.schema';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  sender: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  receiver: Types.ObjectId;

  @Prop({ default: '' })
  text: string;

  @Prop({ type: Types.ObjectId, ref: Image.name, default: null })
  imageId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  imageVersionId: string | null;

  @Prop({
    type: [
      {
        imageId: { type: Types.ObjectId, ref: Image.name, required: true },
        imageVersionId: { type: String, default: null },
      },
    ],
    default: [],
  })
  images: { imageId: Types.ObjectId; imageVersionId: string | null }[];

  @Prop({
    type: [
      {
        user: { type: Types.ObjectId, ref: User.name, required: true },
        emoji: { type: String, required: true },
      },
    ],
    default: [],
  })
  reactions: { user: Types.ObjectId; emoji: string }[];

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: Date, default: null })
  readAt: Date | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
