import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SupportPriority, SupportRequestCategory, SupportRequestStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AdminSupportListDto {
  @ApiPropertyOptional({ enum: SupportRequestStatus })
  @IsOptional()
  @IsEnum(SupportRequestStatus)
  status?: SupportRequestStatus;

  @ApiPropertyOptional({ enum: SupportRequestCategory })
  @IsOptional()
  @IsEnum(SupportRequestCategory)
  category?: SupportRequestCategory;

  @ApiPropertyOptional({ enum: SupportPriority })
  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;
}

export class AdminReplySupportRequestDto {
  @ApiProperty({ example: "We found the ticket and restored it to your account." })
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  message: string;

  @ApiPropertyOptional({ enum: SupportRequestStatus, default: SupportRequestStatus.WAITING_ON_USER })
  @IsOptional()
  @IsEnum(SupportRequestStatus)
  status?: SupportRequestStatus;
}

export class UpdateSupportRequestDto {
  @ApiPropertyOptional({ enum: SupportRequestStatus })
  @IsOptional()
  @IsEnum(SupportRequestStatus)
  status?: SupportRequestStatus;

  @ApiPropertyOptional({ enum: SupportPriority })
  @IsOptional()
  @IsEnum(SupportPriority)
  priority?: SupportPriority;
}
