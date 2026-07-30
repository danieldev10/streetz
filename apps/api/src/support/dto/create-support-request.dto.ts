import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SupportRequestCategory } from "@prisma/client";
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSupportRequestDto {
  @ApiProperty({ enum: SupportRequestCategory })
  @IsEnum(SupportRequestCategory)
  category: SupportRequestCategory;

  @ApiProperty({ example: "I cannot access my event ticket" })
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  subject: string;

  @ApiProperty({ example: "I booked yesterday, but the ticket is not showing in my account." })
  @IsString()
  @MinLength(10)
  @MaxLength(4_000)
  message: string;

  @ApiPropertyOptional({ example: "/events" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  currentPage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  appVersion?: string;
}

export class CreateGuestSupportRequestDto extends CreateSupportRequestDto {
  @ApiProperty({ example: "guest@example.com" })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: "Daniel" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName: string;
}
