import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import sharp from 'sharp';
import type { FormatEnum } from 'sharp';
import 'multer';
import type { Express } from 'express';
import { StorageService } from '../storage/storage.service';
import type {
	CompressionPreviewDto,
	TransformImageDto,
} from './dto/transform-image.dto';
import { Album, AlbumDocument } from './schemas/albums.schema';
import {
	Image,
	ImageDocument,
	ImageTransformHistory,
} from './schemas/images.schema';

@Injectable()
export class ImagesService {
	private readonly logger = new Logger(ImagesService.name);

	constructor(
		@InjectModel(Image.name) private readonly imageModel: Model<ImageDocument>,
		@InjectModel(Album.name) private readonly albumModel: Model<AlbumDocument>,
		private readonly storageService: StorageService,
	) {}

	async create(file: Express.Multer.File, ownerId: string) {
		if (!Types.ObjectId.isValid(ownerId)) {
			throw new BadRequestException('მომხმარებლის ID არასწორია');
		}

		let originalKey: string | undefined;

		try {
			const metadata = await sharp(file.buffer).metadata();

			if (!metadata.format) {
				throw new BadRequestException('ფაილის ფორმატი ვერ განისაზღვრა');
			}

			originalKey = await this.storageService.uploadFile(
				file.buffer,
				file.originalname,
				file.mimetype,
				'originals',
			);

			const image = await this.imageModel.create({
				owner: new Types.ObjectId(ownerId),
				originalKey,
				format: metadata.format,
				size: file.size,
				width: metadata.width,
				height: metadata.height,
			});

			return {
				id: image._id,
				url: await this.storageService.getSignedUrl(originalKey),
				metadata: {
					format: image.format,
					size: image.size,
					width: image.width,
					height: image.height,
				},
			};
		} catch (error) {
			if (originalKey) {
				try {
					await this.storageService.deleteFile(originalKey);
				} catch (cleanupError) {
					this.logger.error(
						`S3 cleanup failed for ${originalKey}: ${this.getErrorMessage(cleanupError)}`,
					);
				}
			}

			if (error instanceof BadRequestException) {
				throw error;
			}

			this.logger.error(
				`Image upload failed: ${this.getErrorMessage(error)}`,
			);
			throw new InternalServerErrorException(
				'სურათის ატვირთვა ვერ მოხერხდა. შეამოწმე server terminal-ის log.',
			);
		}
	}

	async transform(
		imageId: string,
		ownerId: string,
		transformations: TransformImageDto,
	) {
		if (!Types.ObjectId.isValid(imageId)) {
			throw new BadRequestException('სურათის ID არასწორია');
		}

		if (!Types.ObjectId.isValid(ownerId)) {
			throw new BadRequestException('მომხმარებლის ID არასწორია');
		}

		const imageDocument = await this.imageModel.findOne({
			_id: imageId,
			owner: new Types.ObjectId(ownerId),
		});

		if (!imageDocument) {
			throw new NotFoundException('სურათი ვერ მოიძებნა');
		}

		let transformedKey: string | undefined;

		try {
			const inputBuffer = await this.storageService.downloadFile(
				this.resolveSourceKey(imageDocument, transformations.sourceVersionId),
			);
			const image = sharp(inputBuffer);

			if (transformations.resize) {
				image.resize(
					transformations.resize.width,
					transformations.resize.height,
				);
			}

			if (transformations.crop) {
				const { width, height, x, y } = transformations.crop;
				image.extract({ left: x, top: y, width, height });
			}

			if (transformations.rotate !== undefined) {
				image.rotate(transformations.rotate);
			}

			if (transformations.filters?.grayscale) {
				image.grayscale();
			}

			if (transformations.filters?.flip) {
				image.flip();
			}

			if (transformations.filters?.mirror) {
				image.flop();
			}

			if (transformations.filters?.sepia) {
				image.tint({ r: 112, g: 66, b: 20 });
			}

			if (
				!transformations.filters?.grayscale &&
				!transformations.filters?.sepia
			) {
				switch (transformations.filters?.color) {
					case 'warm':
						image.modulate({ brightness: 1.03, saturation: 1.15, hue: 8 });
						break;
					case 'cool':
						image.modulate({ brightness: 1.02, saturation: 1.08, hue: -8 });
						break;
					case 'vintage':
						image.modulate({ brightness: 0.96, saturation: 0.72, hue: -5 });
						image.tint({ r: 222, g: 190, b: 150 });
						break;
					case 'vivid':
						image.modulate({ brightness: 1.02, saturation: 1.45 });
						break;
					case 'fade':
						image.modulate({ brightness: 1.08, saturation: 0.72 });
						image.linear(0.92, 10);
						break;
				}
			}

			const outputFormat =
				transformations.format ??
				(await sharp(inputBuffer).metadata()).format ??
				'jpeg';
			const normalizedFormat = outputFormat === 'jpg' ? 'jpeg' : outputFormat;

			if (transformations.format) {
				image.toFormat(normalizedFormat as keyof FormatEnum);
			}

			if (transformations.compress) {
				if (normalizedFormat === 'jpeg') {
					image.jpeg({ quality: transformations.compress.quality });
				} else if (normalizedFormat === 'png') {
					image.png({ quality: transformations.compress.quality });
				} else if (normalizedFormat === 'webp') {
					image.webp({ quality: transformations.compress.quality });
				}
			}

			const outputBuffer = await image.toBuffer();
			const metadata = await sharp(outputBuffer).metadata();
			const mimeType = this.getMimeType(normalizedFormat);

			transformedKey = await this.storageService.uploadFile(
				outputBuffer,
				`transformed-${imageId}.${normalizedFormat}`,
				mimeType,
				'transformed',
			);
			const url = await this.storageService.getSignedUrl(transformedKey);

			imageDocument.transformedKeys.push(transformedKey);
			const { sourceVersionId } = transformations;
			const settings = JSON.parse(
				JSON.stringify({
					resize: transformations.resize,
					crop: transformations.crop,
					rotate: transformations.rotate,
					filters: transformations.filters,
					compress: transformations.compress,
					format: transformations.format,
				}),
			) as Record<string, unknown>;
			const version: ImageTransformHistory = {
				id: new Types.ObjectId().toString(),
				version: imageDocument.transformedKeys.length,
				key: transformedKey,
				createdAt: new Date(),
				sourceVersionId,
				settings,
				metadata: {
					format: metadata.format,
					size: outputBuffer.length,
					width: metadata.width,
					height: metadata.height,
				},
			};
			imageDocument.transformHistory.push(version);
			imageDocument.markModified('transformedKeys');
			imageDocument.markModified('transformHistory');
			await imageDocument.save();

			return {
				id: imageDocument._id,
				versionId: version.id,
				url,
				metadata: version.metadata,
			};
		} catch (error) {
			if (transformedKey) {
				try {
					await this.storageService.deleteFile(transformedKey);
				} catch (cleanupError) {
					this.logger.error(
						`S3 cleanup failed for ${transformedKey}: ${this.getErrorMessage(cleanupError)}`,
					);
				}
			}

			if (
				error instanceof BadRequestException ||
				error instanceof NotFoundException
			) {
				throw error;
			}

			this.logger.error(
				`Image transform failed: ${this.getErrorMessage(error)}`,
			);
			throw new InternalServerErrorException(
				'სურათის ტრანსფორმაცია ვერ მოხერხდა. შეამოწმე server terminal-ის log.',
			);
		}
	}

	async previewCompression(
		imageId: string,
		ownerId: string,
		compression: CompressionPreviewDto,
	) {
		this.validateObjectIds(imageId, ownerId);

		const imageDocument = await this.imageModel.findOne({
			_id: imageId,
			owner: new Types.ObjectId(ownerId),
		});

		if (!imageDocument) {
			throw new NotFoundException('სურათი ვერ მოიძებნა');
		}

		const inputBuffer = await this.storageService.downloadFile(
			this.resolveSourceKey(imageDocument, compression.sourceVersionId),
		);
		const format = compression.format ?? imageDocument.format ?? 'jpeg';
		const normalizedFormat = format === 'jpg' ? 'jpeg' : format;
		const image = sharp(inputBuffer);

		switch (normalizedFormat) {
			case 'jpeg':
				image.jpeg({ quality: compression.quality });
				break;
			case 'png':
				image.png({ quality: compression.quality });
				break;
			case 'webp':
				image.webp({ quality: compression.quality });
				break;
			default:
				throw new BadRequestException(
					'Compression preview supports JPEG, PNG, and WebP',
				);
		}

		const buffer = await image.toBuffer();
		return { buffer, mimeType: this.getMimeType(normalizedFormat) };
	}

	async findOne(imageId: string, ownerId: string) {
		this.validateObjectIds(imageId, ownerId);

		const image = await this.imageModel
			.findOne({
				_id: imageId,
				owner: new Types.ObjectId(ownerId),
			})
			.populate('owner', 'username');

		if (!image) {
			throw new NotFoundException('სურათი ვერ მოიძებნა');
		}

		return this.toImageResponse(image);
	}

	async remove(imageId: string, ownerId: string) {
		this.validateObjectIds(imageId, ownerId);

		const image = await this.imageModel.findOne({
			_id: imageId,
			owner: new Types.ObjectId(ownerId),
		});

		if (!image) {
			throw new NotFoundException('სურათი ვერ მოიძებნა');
		}

		await this.storageService.deleteFile(image.originalKey);
		await Promise.all(
			image.transformedKeys.map((key) =>
				this.storageService.deleteFile(key),
			),
		);
		await this.imageModel.deleteOne({ _id: image._id });
		await this.albumModel.updateMany(
			{ owner: new Types.ObjectId(ownerId) },
			{ $pull: { imageIds: image._id } },
		);

		return {
			message: 'სურათი წარმატებით წაიშალა',
			id: image._id,
		};
	}

	async findAll(ownerId: string, pageValue: string, limitValue: string) {
		return this.findImages(ownerId, pageValue, limitValue);
	}

	async findFavorites(ownerId: string, pageValue: string, limitValue: string) {
		return this.findImages(ownerId, pageValue, limitValue, true);
	}

	private async findImages(
		ownerId: string,
		pageValue: string,
		limitValue: string,
		favoriteOnly = false,
	) {
		if (!Types.ObjectId.isValid(ownerId)) {
			throw new BadRequestException('მომხმარებლის ID არასწორია');
		}

		const page = this.parsePaginationValue(pageValue, 'page');
		const limit = this.parsePaginationValue(limitValue, 'limit');

		if (limit > 100) {
			throw new BadRequestException('limit უნდა იყოს 100-ზე ნაკლები ან ტოლი');
		}

		const owner = new Types.ObjectId(ownerId);
		const filter = favoriteOnly ? { owner, isFavorite: true } : { owner };
		const [images, total] = await Promise.all([
			this.imageModel
				.find(filter)
				.sort({ createdAt: -1 })
				.skip((page - 1) * limit)
				.limit(limit)
				.populate('owner', 'username'),
			this.imageModel.countDocuments(filter),
		]);

		return {
			data: await Promise.all(images.map((image) => this.toImageResponse(image))),
			meta: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
				hasNextPage: page * limit < total,
			},
		};
	}

	async toggleFavorite(imageId: string, ownerId: string) {
		this.validateObjectIds(imageId, ownerId);

		const image = await this.imageModel.findOne({
			_id: imageId,
			owner: new Types.ObjectId(ownerId),
		});

		if (!image) {
			throw new NotFoundException('სურათი ვერ მოიძებნა');
		}

		image.isFavorite = !image.isFavorite;
		await image.save();

		return {
			id: image._id,
			isFavorite: image.isFavorite,
		};
	}

	private async toImageResponse(image: ImageDocument) {
		const historyByKey = new Map(
			(image.transformHistory ?? []).map((version) => [version.key, version]),
		);
		const transformHistory = await Promise.all(
			image.transformedKeys.map(async (key, index) => {
				const version = historyByKey.get(key);
				return {
					id: version?.id ?? `legacy-${index + 1}`,
					version: version?.version ?? index + 1,
					url: await this.storageService.getSignedUrl(key),
					createdAt: version?.createdAt ?? null,
					sourceVersionId: version?.sourceVersionId,
					settings: version?.settings ?? null,
					metadata: version?.metadata ?? null,
				};
			}),
		);
		const transformedUrls = transformHistory.map((version) => version.url);

		return {
			id: image._id,
			owner: image.owner,
			isFavorite: image.isFavorite,
			url: await this.storageService.getSignedUrl(image.originalKey),
			transformedUrls,
			transformHistory,
			metadata: {
				format: image.format,
				size: image.size,
				width: image.width,
				height: image.height,
			},
		};
	}

	private resolveSourceKey(image: ImageDocument, sourceVersionId?: string) {
		if (!sourceVersionId) return image.originalKey;

		const version = (image.transformHistory ?? []).find(
			(entry) => entry.id === sourceVersionId,
		);
		if (version) return version.key;

		const legacyVersion = /^legacy-(\d+)$/.exec(sourceVersionId);
		if (legacyVersion) {
			const key = image.transformedKeys[Number(legacyVersion[1]) - 1];
			if (key && !image.transformHistory?.some((entry) => entry.key === key)) {
				return key;
			}
		}

		throw new NotFoundException('არჩეული ვერსია ვერ მოიძებნა');
	}

	private validateObjectIds(imageId: string, ownerId: string) {
		if (!Types.ObjectId.isValid(imageId)) {
			throw new BadRequestException('სურათის ID არასწორია');
		}

		if (!Types.ObjectId.isValid(ownerId)) {
			throw new BadRequestException('მომხმარებლის ID არასწორია');
		}
	}

	private parsePaginationValue(value: string, field: string): number {
		const parsedValue = Number(value);

		if (!Number.isInteger(parsedValue) || parsedValue < 1) {
			throw new BadRequestException(`${field} უნდა იყოს დადებითი მთელი რიცხვი`);
		}

		return parsedValue;
	}

	private getMimeType(format: string): string {
		if (format === 'jpeg') {
			return 'image/jpeg';
		}

		return `image/${format}`;
	}

	private getErrorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
}
