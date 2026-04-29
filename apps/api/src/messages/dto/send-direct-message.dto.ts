import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class SendDirectMessageDto {
  @ApiProperty({ example: "Hey, good to match with you." })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}
