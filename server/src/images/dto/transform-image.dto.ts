import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResizeDto {
  @ApiProperty({ minimum: 1, example: 800 })
  @IsInt()
  @Min(1)
  width: number;

  @ApiProperty({ minimum: 1, example: 600 })
  @IsInt()
  @Min(1)
  height: number;
}

export class CropDto {
  @ApiProperty({ minimum: 1, example: 600 })
  @IsInt()
  @Min(1)
  width: number;

  @ApiProperty({ minimum: 1, example: 400 })
  @IsInt()
  @Min(1)
  height: number;

  @ApiProperty({ minimum: 0, example: 0 })
  @IsInt()
  @Min(0)
  x: number;

  @ApiProperty({ minimum: 0, example: 0 })
  @IsInt()
  @Min(0)
  y: number;
}

export class FiltersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  grayscale?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  flip?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mirror?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sepia?: boolean;
}

export class CompressDto {
  @ApiProperty({ minimum: 1, maximum: 100, example: 80 })
  @IsInt()
  @Min(1)
  @Max(100)
  quality: number;
}

export class TransformImageDto {
  @ApiPropertyOptional({ type: () => ResizeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResizeDto)
  resize?: ResizeDto;

  @ApiPropertyOptional({ type: () => CropDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CropDto)
  crop?: CropDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 360, example: 90 })
  @IsOptional()
  @IsInt()
  rotate?: number;

  @ApiPropertyOptional({ enum: ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff'] })
  @IsOptional()
  @IsString()
  @IsIn(['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff'])
  format?: string;

  @ApiPropertyOptional({ type: () => FiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FiltersDto)
  filters?: FiltersDto;

  @ApiPropertyOptional({ type: () => CompressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompressDto)
  compress?: CompressDto;
}
