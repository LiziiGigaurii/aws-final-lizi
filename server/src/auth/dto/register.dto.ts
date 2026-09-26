import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ minLength: 3, maxLength: 30, example: 'framehouse-user' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @ApiProperty({ minLength: 6, maxLength: 25, format: 'password' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(25)
  password: string;
}