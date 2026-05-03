import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateProfilePhotoDto {
  @ApiProperty({ example: "profiles/user-id/1714320000000-a1b2c3.jpg" })
  @IsString()
  @MaxLength(500)
  objectKey: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  sortOrder?: number;
}
