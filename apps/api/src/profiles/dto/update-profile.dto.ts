import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ConnectionStatus, Gender, Sexuality } from "@prisma/client";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from "class-validator";

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: "Ada" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName?: string;

  @ApiPropertyOptional({ example: "Food popups, live music, and beach days." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: "1998-06-14" })
  @IsOptional()
  @IsISO8601({ strict: true })
  birthDate?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ enum: Sexuality })
  @IsOptional()
  @IsEnum(Sexuality)
  sexuality?: Sexuality;

  @ApiPropertyOptional({ enum: ConnectionStatus })
  @IsOptional()
  @IsEnum(ConnectionStatus)
  connectionStatus?: ConnectionStatus;

  @ApiPropertyOptional({ example: "Lagos" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ example: "Lagos" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @ApiPropertyOptional({ example: 6.5244 })
  @ValidateIf((dto: UpdateProfileDto) => dto.latitude !== undefined || dto.longitude !== undefined)
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 3.3792 })
  @ValidateIf((dto: UpdateProfileDto) => dto.latitude !== undefined || dto.longitude !== undefined)
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ example: 35 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000)
  locationAccuracyMeters?: number;

  @ApiPropertyOptional({ example: 50, description: "0 means no distance limit" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  maxDistanceKm?: number;

  @ApiPropertyOptional({ example: ["Live music", "Art", "Food"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  interests?: string[];
}
