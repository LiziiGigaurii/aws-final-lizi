import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ImageDocument = HydratedDocument<Image>;
export type ImageTransformHistory = {
  id: string;
  version: number;
  key: string;
  createdAt: Date;
  sourceVersionId?: string;
  settings: Record<string, unknown>;
  metadata: { format?: string; size: number; width?: number; height?: number };
};

@Schema({ timestamps: true })
export class Image {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  owner: Types.ObjectId;

  @Prop({ required: true })
  originalKey: string;

  @Prop({ type: [String], default: [] })
  transformedKeys: string[];

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  transformHistory: ImageTransformHistory[];

  @Prop({ default: false })
  isFavorite: boolean;

  @Prop({ required: true })
  format: string;

  @Prop({ required: true })
  size: number;

  @Prop()
  width: number;

  @Prop()
  height: number;
}

export const ImageSchema = SchemaFactory.createForClass(Image)