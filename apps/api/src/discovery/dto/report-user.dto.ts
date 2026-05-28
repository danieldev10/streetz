import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { REPORT_REASON_VALUES } from "../report-reasons";

export class ReportUserDto {
  @ApiProperty({ example: "clxprofileuser123" })
  @IsString()
  targetUserId: string;

  @ApiProperty({ enum: REPORT_REASON_VALUES, example: "Fake profile or impersonation" })
  @IsString()
  @IsIn([...REPORT_REASON_VALUES])
  reason: string;

  @ApiPropertyOptional({ example: "They asked to move payment outside the platform." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
