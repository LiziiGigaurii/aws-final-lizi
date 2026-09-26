import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'framehouse-user' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}