import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class SendRoomMessageDto {
  @ApiProperty({ example: "Anyone around Lekki tonight?" })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  body?: string;

  @ApiProperty({ required: false, example: "https://media.giphy.com/media/example/giphy.gif" })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  gifUrl?: string;
}
