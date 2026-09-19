import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import 'multer';
import type { Express, Request as ExpressRequest } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TransformImageDto } from './dto/transform-image.dto';
import { ImagesService } from './images.service';

type AuthenticatedRequest = ExpressRequest & {
  userId?: string;
  role?: string;
};

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @Post()
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
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/transform')
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
  getProtected(@Request() req: any) {
    return {
      message: 'შენ ავტორიზებული ხარ',
      userId: req.userId,
      role: req.role,
    };
  }

  @UseGuards(AuthGuard)
  @Patch(':id/favorite')
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
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.findOne(id, req.userId);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.userId) {
      throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    }

    return this.imagesService.remove(id, req.userId);
  }
}