import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Request,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import 'multer';
import type { Express, Request as ExpressRequest } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import {
  CompressionPreviewDto,
  TransformImageDto,
} from './dto/transform-image.dto';
import { ImagesService } from './images.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

type AuthenticatedRequest = ExpressRequest & {
  userId?: string;
  role?: string;
};

@Controller('images')
@ApiTags('Images')
@ApiBearerAuth()
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @Post()
  @ApiOperation({ summary: 'Upload an image to the authenticated user library' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('ფაილი სავალდებულოა');
    }

    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.create(file, req.userId);
  }

  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @Post('chat-attachment')
  @ApiOperation({ summary: 'Upload an image for chat without adding it to the library' })
  @ApiConsumes('multipart/form-data')
  uploadChatAttachment(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('ფაილი სავალდებულოა');
    }

    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.create(file, req.userId, true);
  }

  @UseGuards(AuthGuard)
  @Post(':id/compression-preview')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Preview image compression without saving a version' })
  async previewCompression(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() compression: CompressionPreviewDto,
  ) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    const preview = await this.imagesService.previewCompression(
      id,
      req.userId,
      compression,
    );
    return new StreamableFile(preview.buffer, { type: preview.mimeType });
  }

  @UseGuards(AuthGuard)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/transform')
  @ApiOperation({ summary: 'Create a transformed version of an image' })
  transform(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() transformations: TransformImageDto,
  ) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.transform(id, req.userId, transformations);
  }

  @UseGuards(AuthGuard)
  @Get()
  @ApiOperation({ summary: 'List the authenticated user images' })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.findAll(req.userId, page, limit);
  }

  @UseGuards(AuthGuard)
  @Get('favorites')
  @ApiOperation({ summary: 'List the authenticated user favorite images' })
  findFavorites(
    @Request() req: AuthenticatedRequest,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.findFavorites(req.userId, page, limit);
  }

  @UseGuards(AuthGuard)
  @Get('protected')
  @ApiOperation({ summary: 'Check the current authenticated user' })
  getProtected(@Request() req: any) {
    return {
      message: 'შენ ავტორიზებული ხარ',
      userId: req.userId,
      role: req.role,
    };
  }

  @UseGuards(AuthGuard)
  @Patch(':id/favorite')
  @ApiOperation({ summary: 'Toggle an image favorite state' })
  toggleFavorite(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.toggleFavorite(id, req.userId);
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get one image owned by the current user' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.findOne(id, req.userId);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete an image and its transformed files' })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.remove(id, req.userId);
  }
}