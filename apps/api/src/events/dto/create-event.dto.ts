import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EventStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

export const EVENT_TICKET_TIER_NAMES = ["Regular", "VIP", "Tables"] as const;
export const EVENT_CATEGORY_NAMES = [
  "Music",
  "Nightlife",
  "Theatre",
  "Holidays",
  "Dating",
  "Hobbies",
  "Business",
  "Food & Drink",
  "Sports & Fitness",
  "Fashion",
  "Tech",
  "Community"
] as const;

export class EventTicketTierDto {
  @ApiProperty({ enum: EVENT_TICKET_TIER_NAMES, example: "Regular" })
  @IsString()
  @IsIn(EVENT_TICKET_TIER_NAMES)
  name: (typeof EVENT_TICKET_TIER_NAMES)[number];

  @ApiPropertyOptional({ example: 750000, description: "Tier price in kobo. Use 0 or omit all tier prices for a free event." })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceKobo?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ example: 4, description: "Maximum tickets one member can own for this tier." })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTicketsPerUser?: number;
}

export class CreateEventDto {
  @ApiProperty({ example: "Island Social Night" })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @ApiProperty({ enum: EVENT_CATEGORY_NAMES, example: "Nightlife" })
  @IsString()
  @IsIn(EVENT_CATEGORY_NAMES)
  @MaxLength(40)
  category: (typeof EVENT_CATEGORY_NAMES)[number];

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

  @ApiProperty({ example: "Lagos" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state: string;

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

  @ApiPropertyOptional({ type: [EventTicketTierDto], description: "Regular, VIP, and Tables ticket tier settings." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => EventTicketTierDto)
  ticketTypes?: EventTicketTierDto[];

  @ApiPropertyOptional({ example: 750000, description: "Legacy ticket price in kobo. Use ticketTypes for tiered events." })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceKobo?: number;

  @ApiPropertyOptional({ example: 100, description: "Legacy event capacity. Use ticketTypes for tiered events." })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ example: 4, description: "Legacy maximum tickets one member can own for the default tier." })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTicketsPerUser?: number;
}
