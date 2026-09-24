import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateConversationRequestDto {
  @ApiProperty({ example: "clxprofileuser123" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  targetUserId: string;

  @ApiProperty({ example: "Hey, I saw we are both looking to make new friends." })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body: string;
}
