import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ConnectionStatus, Gender, Sexuality } from "@prisma/client";
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

export class DiscoveryFiltersDto {
  @ApiPropertyOptional({ minimum: 18, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(100)
  minAge?: number;

  @ApiPropertyOptional({ minimum: 18, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(100)
  maxAge?: number;

  @ApiPropertyOptional({ enum: Gender, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsEnum(Gender, { each: true })
  gender?: Gender[];

  @ApiPropertyOptional({ enum: Sexuality, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsEnum(Sexuality, { each: true })
  sexuality?: Sexuality[];

  @ApiPropertyOptional({ enum: ConnectionStatus, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsEnum(ConnectionStatus, { each: true })
  lookingFor?: ConnectionStatus[];
}
