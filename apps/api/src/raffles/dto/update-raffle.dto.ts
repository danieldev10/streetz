import { ApiPropertyOptional } from "@nestjs/swagger";
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

export class UpdateRaffleDto {
  @ApiPropertyOptional({ example: "Win a Brand New Car" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

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

  @ApiPropertyOptional({ example: "Toyota RAV4 2024" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  prizeTitle?: string;

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

  @ApiPropertyOptional({ example: "Cars" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  prizeCategory?: string;

  @ApiPropertyOptional({ example: 2500000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  prizeEstimatedValueKobo?: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  ticketPriceKobo?: number;

  @ApiPropertyOptional({ example: "2026-07-01T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  salesStartsAt?: string;

  @ApiPropertyOptional({ example: "2026-07-16T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  salesEndsAt?: string;

  @ApiPropertyOptional({ example: "2026-07-16T18:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  drawsAt?: string;

  @ApiPropertyOptional({ enum: EventStatus, example: EventStatus.PUBLISHED })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ example: "Prize supplier fell through; all entries will be refunded." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;
}
