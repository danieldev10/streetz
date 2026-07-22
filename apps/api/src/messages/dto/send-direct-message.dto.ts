import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class SendDirectMessageDto {
  @ApiProperty({ example: "Hey, good to match with you." })
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
