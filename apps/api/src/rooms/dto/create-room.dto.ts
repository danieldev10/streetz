import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateRoomDto {
  @ApiProperty({ example: "After Work" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: "Social" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category: string;

  @ApiPropertyOptional({ example: "After-work links, plans, and member updates." })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
