import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class SendRoomMessageDto {
  @ApiProperty({ example: "Anyone around Lekki tonight?" })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}
