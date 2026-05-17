import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EventStatus } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

export class CreateEventDto {
  @ApiProperty({ example: "Island Social Night" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ example: "A curated night out for crushclub members." })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @ApiPropertyOptional({ example: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImage?: string;

  @ApiProperty({ example: "The House Lagos" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  venue: string;

  @ApiProperty({ example: "Victoria Island" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city: string;

  @ApiProperty({ example: "2026-06-15T19:30:00.000Z" })
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional({ example: "2026-06-15T23:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ enum: EventStatus, example: EventStatus.PUBLISHED })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ example: 750000, description: "Ticket price in kobo. Use 0 for free events." })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceKobo?: number;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  capacity: number;
}
