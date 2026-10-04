import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  async register(dto: RegisterDto) {
    this.logger.info({ username: dto.username }, 'რეგისტრაციის მცდელობა');

    const existingUser = await this.usersService.findByUsername(dto.username);
    if (existingUser) {
      this.logger.warn({ username: dto.username }, 'username უკვე დაკავებულია');
      throw new ConflictException('ეს username უკვე დაკავებულია');
    }

    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('ეს email უკვე რეგისტრირებულია');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    let user;
    try {
      user = await this.usersService.create(
        dto.username,
        dto.email,
        hashedPassword,
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException('ეს email უკვე რეგისტრირებულია');
      }
      throw error;
    }

    this.logger.info({ userId: user._id }, 'user წარმატებით დარეგისტრირდა');

    return { message: 'რეგისტრაცია წარმატებულია', userId: user._id };
  }

  async login(dto: LoginDto) {
    this.logger.info('შესვლის მცდელობა');

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.warn('user ვერ მოიძებნა');
      throw new UnauthorizedException('არასწორი email ან password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      this.logger.warn('არასწორი პაროლი');
      throw new UnauthorizedException('არასწორი email ან password');
    }

    // payload ისეთივეა, როგორსაც AuthGuard ელოდება: userId, role
    const payload = { userId: user._id, role: 'user' };
    const token = this.jwtService.sign(payload);

    this.logger.info({ userId: user._id }, 'user წარმატებით შევიდა');

    return { access_token: token, username: user.username };
  }
}