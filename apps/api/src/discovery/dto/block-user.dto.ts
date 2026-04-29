import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class BlockUserDto {
  @ApiProperty({ example: "clxprofileuser123" })
  @IsString()
  targetUserId: string;

  @ApiPropertyOptional({ example: "Not a good fit" })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;
}
