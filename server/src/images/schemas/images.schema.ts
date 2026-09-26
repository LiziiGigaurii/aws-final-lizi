import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type ImageDocument = HydratedDocument<Image>;

@Schema({ timestamps: true })
export class Image {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  owner: Types.ObjectId;

  @Prop({ required: true })
  originalKey: string;

  @Prop({ type: [String], default: [] })
  transformedKeys: string[];

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