import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Image, ImageSchema } from './schemas/images.schema';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Image.name, schema: ImageSchema }]),
    StorageModule,
    AuthModule,
  ],
  controllers: [ImagesController],
  providers: [ImagesService],
})
export class ImagesModule {}