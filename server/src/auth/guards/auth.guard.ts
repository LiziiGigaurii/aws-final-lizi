import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.getToken(request.headers);

    if (!token) throw new BadRequestException();

    try {
      const payLoad = this.jwtService.verify(token);
      request.userId = payLoad.userId;
      request.role = payLoad.role;
    } catch (error) {
      throw new BadRequestException();
    }

    return true;
  }

  getToken(headers: Record<string, string | undefined>) {
    if (!headers['authorization']) return null;
    const [type, token] = headers['authorization'].split(' ');
    return type === 'Bearer' ? token : null;
  }
}