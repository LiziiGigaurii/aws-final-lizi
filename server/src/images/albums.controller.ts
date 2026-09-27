import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AlbumsService } from './albums.service';

type AuthenticatedRequest = ExpressRequest & { userId?: string };

@Controller('albums')
@ApiTags('Albums')
@ApiBearerAuth()
export class AlbumsController {
  constructor(private readonly albumsService: AlbumsService) {}

  @UseGuards(AuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create an album for the authenticated user' })
  create(@Body() body: { name?: string }, @Request() req: AuthenticatedRequest) {
    if (!req.userId) throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    return this.albumsService.create(body?.name ?? '', req.userId);
  }

  @UseGuards(AuthGuard)
  @Get()
  @ApiOperation({ summary: 'List the authenticated user albums' })
  findAll(@Request() req: AuthenticatedRequest) {
    if (!req.userId) throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    return this.albumsService.findAll(req.userId);
  }

  @UseGuards(AuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get an album and its images' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    if (!req.userId) throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    return this.albumsService.findOne(id, req.userId);
  }

  @UseGuards(AuthGuard)
  @Post(':id/images')
  @ApiOperation({ summary: 'Add owned images to an album' })
  addImages(
    @Param('id') id: string,
    @Body() body: { imageIds?: string[] },
    @Request() req: AuthenticatedRequest,
  ) {
    if (!req.userId) throw new BadRequestException('მომხმარებელი ვერ განისაზღვრა');
    return this.albumsService.addImages(id, req.userId, body?.imageIds ?? []);
  }
}