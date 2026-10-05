import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('search')
  async searchByUsernameOrEmail(@Query('query') query: string) {
    const normalized = query?.trim();
    if (!normalized) {
      throw new BadRequestException('Query is required');
    }

    const user = await this.usersService.findByUsernameOrEmail(normalized);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user._id,
      username: user.username,
      email: user.email,
    };
  }
}
