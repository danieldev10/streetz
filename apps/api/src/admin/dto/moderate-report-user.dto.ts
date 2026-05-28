import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ModerationActionType } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ModerateReportUserDto {
  @ApiProperty({
    enum: ModerationActionType,
    example: ModerationActionType.SUSPEND
  })
  @IsEnum(ModerationActionType)
  action: ModerationActionType;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;

  @ApiPropertyOptional({ example: "Repeated abusive messages." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
