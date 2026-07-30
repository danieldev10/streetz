import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ReplySupportRequestDto {
  @ApiProperty({ example: "Here are the additional details you requested." })
  @IsString()
  @MinLength(1)
  @MaxLength(4_000)
  message: string;
}
