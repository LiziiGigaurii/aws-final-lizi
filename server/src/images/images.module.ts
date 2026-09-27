import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Image, ImageSchema } from './schemas/images.schema';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { Album, AlbumSchema } from './schemas/albums.schema';
import { AlbumsController } from './albums.controller';
import { AlbumsService } from './albums.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Image.name, schema: ImageSchema },
      { name: Album.name, schema: AlbumSchema },
    ]),
    StorageModule,
    AuthModule,
  ],
  controllers: [ImagesController, AlbumsController],
  providers: [ImagesService, AlbumsService],
})
export class ImagesModule {}