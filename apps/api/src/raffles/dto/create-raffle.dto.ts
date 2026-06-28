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

export class CreateRaffleDto {
  @ApiProperty({ example: "Win a Brand New Car" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ example: "Buy raffle tickets for a chance to drive home a brand new SUV." })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @ApiPropertyOptional({ example: "https://cdn.crushclub.app/events/cover.jpg" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImage?: string;

  @ApiProperty({ example: "Toyota RAV4 2024" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  prizeTitle: string;

  @ApiPropertyOptional({ example: "Brand new, fully loaded, delivered to the winner." })
  @IsOptional()
  @IsString()
  @MaxLength(600)
  prizeDescription?: string;

  @ApiPropertyOptional({ example: "https://cdn.crushclub.app/events/prize.jpg" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prizeImage?: string;

  @ApiPropertyOptional({ example: "Cars", description: "Free-form prize category, e.g. Cars, Appliances, Electronics." })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  prizeCategory?: string;

  @ApiPropertyOptional({ example: 2500000000, description: "Estimated prize value in kobo." })
  @IsOptional()
  @IsInt()
  @Min(0)
  prizeEstimatedValueKobo?: number;

  @ApiProperty({ example: 500000, description: "Price per raffle ticket in kobo. Must be at least 1 kobo." })
  @IsInt()
  @Min(1)
  ticketPriceKobo: number;

  @ApiProperty({ example: "2026-07-01T00:00:00.000Z" })
  @IsDateString()
  salesStartsAt: string;

  @ApiProperty({ example: "2026-07-16T00:00:00.000Z" })
  @IsDateString()
  salesEndsAt: string;

  @ApiProperty({ example: "2026-07-16T18:00:00.000Z", description: "When the winner will be drawn. Must be at or after sales close." })
  @IsDateString()
  drawsAt: string;

  @ApiPropertyOptional({ enum: [EventStatus.DRAFT, EventStatus.PUBLISHED], example: EventStatus.PUBLISHED })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;
}
