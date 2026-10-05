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

  @Prop({ default: null })
  imageVersionId: string | null;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: null })
  readAt: Date | null;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
