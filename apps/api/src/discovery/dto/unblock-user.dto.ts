import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class UnblockUserDto {
  @ApiProperty({ example: "clxprofileuser123" })
  @IsString()
  targetUserId: string;
}
