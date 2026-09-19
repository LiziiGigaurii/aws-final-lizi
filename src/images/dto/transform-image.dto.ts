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

export class ResizeDto {
  @IsInt()
  @Min(1)
  width: number;

  @IsInt()
  @Min(1)
  height: number;
}

export class CropDto {
  @IsInt()
  @Min(1)
  width: number;

  @IsInt()
  @Min(1)
  height: number;

  @IsInt()
  @Min(0)
  x: number;

  @IsInt()
  @Min(0)
  y: number;
}

export class FiltersDto {
  @IsOptional()
  @IsBoolean()
  grayscale?: boolean;

  @IsOptional()
  @IsBoolean()
  flip?: boolean;

  @IsOptional()
  @IsBoolean()
  mirror?: boolean;

  @IsOptional()
  @IsBoolean()
  sepia?: boolean;
}

export class CompressDto {
  @IsInt()
  @Min(1)
  @Max(100)
  quality: number;
}

export class TransformImageDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ResizeDto)
  resize?: ResizeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CropDto)
  crop?: CropDto;

  @IsOptional()
  @IsInt()
  rotate?: number;

  @IsOptional()
  @IsString()
  @IsIn(['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'tiff'])
  format?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FiltersDto)
  filters?: FiltersDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompressDto)
  compress?: CompressDto;
}
