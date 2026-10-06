import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StorageService } from '../storage/storage.service';
import { Album, AlbumDocument } from './schemas/albums.schema';
import { Image, ImageDocument } from './schemas/images.schema';

@Injectable()
export class AlbumsService {
  constructor(
    @InjectModel(Album.name) private readonly albumModel: Model<AlbumDocument>,
    @InjectModel(Image.name) private readonly imageModel: Model<ImageDocument>,
    private readonly storageService: StorageService,
  ) {}

  async create(name: string, ownerId: string) {
    this.validateOwner(ownerId);
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || trimmedName.length > 80) {
      throw new BadRequestException('ალბომის სახელი 1-80 სიმბოლო უნდა იყოს');
    }

    const album = await this.albumModel.create({
      owner: new Types.ObjectId(ownerId),
      name: trimmedName,
    });
    return this.toAlbumSummary(album);
  }

  async findAll(ownerId: string) {
    this.validateOwner(ownerId);
    const albums = await this.albumModel
      .find({ owner: new Types.ObjectId(ownerId) })
      .sort({ createdAt: -1 });
    return { data: albums.map((album) => this.toAlbumSummary(album)) };
  }

  async findOne(albumId: string, ownerId: string) {
    this.validateIds(albumId, ownerId);
    const album = await this.albumModel.findOne({
      _id: albumId,
      owner: new Types.ObjectId(ownerId),
    });
    if (!album) throw new NotFoundException('ალბომი ვერ მოიძებნა');

    const images = await this.imageModel.find({
      _id: { $in: album.imageIds },
      owner: new Types.ObjectId(ownerId),
    });
    const imagesById = new Map<string, ImageDocument>();
    for (const image of images) imagesById.set(String(image._id), image);
    const orderedImages: ImageDocument[] = [];
    for (const imageId of album.imageIds) {
      const image = imagesById.get(String(imageId));
      if (image) orderedImages.push(image);
    }

    return {
      id: album._id,
      name: album.name,
      images: await Promise.all(orderedImages.map((image) => this.toImageResponse(image))),
    };
  }

  async addImages(albumId: string, ownerId: string, imageIds: string[]) {
    this.validateIds(albumId, ownerId);
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      throw new BadRequestException('აირჩიე მინიმუმ ერთი ფოტო');
    }

    const uniqueIds = [...new Set(imageIds)];
    if (uniqueIds.some((id) => !Types.ObjectId.isValid(id))) {
      throw new BadRequestException('ფოტოს ID არასწორია');
    }

    const album = await this.albumModel.findOne({
      _id: albumId,
      owner: new Types.ObjectId(ownerId),
    });
    if (!album) throw new NotFoundException('ალბომი ვერ მოიძებნა');

    const ownedImages = await this.imageModel.countDocuments({
      _id: { $in: uniqueIds },
      owner: new Types.ObjectId(ownerId),
    });
    if (ownedImages !== uniqueIds.length) {
      throw new NotFoundException('ერთი ან მეტი ფოტო ვერ მოიძებნა');
    }

    await this.albumModel.updateOne(
      { _id: album._id },
      { $addToSet: { imageIds: { $each: uniqueIds } } },
    );
    const updatedAlbum = await this.albumModel.findById(album._id);
    return this.toAlbumSummary(updatedAlbum!);
  }

  private toAlbumSummary(album: AlbumDocument) {
    return {
      id: album._id,
      name: album.name,
      imageCount: album.imageIds.length,
    };
  }

  private async toImageResponse(image: ImageDocument) {
    return {
      id: image._id,
      isFavorite: image.isFavorite,
      url: await this.storageService.getSignedUrl(image.originalKey),
      downloadUrl: await this.storageService.getSignedUrl(
        image.originalKey,
        3600,
        `original${/\.[a-z0-9]+$/i.exec(image.originalKey)?.[0].toLowerCase() ?? ''}`,
      ),
      transformedUrls: await Promise.all(
        image.transformedKeys.map((key) => this.storageService.getSignedUrl(key)),
      ),
      metadata: {
        format: image.format,
        size: image.size,
        width: image.width,
        height: image.height,
      },
    };
  }

  private validateOwner(ownerId: string) {
    if (!Types.ObjectId.isValid(ownerId)) {
      throw new BadRequestException('მომხმარებლის ID არასწორია');
    }
  }

  private validateIds(albumId: string, ownerId: string) {
    if (!Types.ObjectId.isValid(albumId)) {
      throw new BadRequestException('ალბომის ID არასწორია');
    }
    this.validateOwner(ownerId);
  }
}