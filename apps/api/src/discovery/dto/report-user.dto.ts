import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ReportUserDto {
  @ApiProperty({ example: "clxprofileuser123" })
  @IsString()
  targetUserId: string;

  @ApiProperty({ example: "Suspicious profile" })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  reason: string;

  @ApiPropertyOptional({ example: "They asked to move payment outside the platform." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
