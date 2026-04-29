import { ApiProperty } from "@nestjs/swagger";
import { DiscoveryAction } from "@prisma/client";
import { IsEnum, IsString } from "class-validator";

export class DiscoveryActionDto {
  @ApiProperty({ example: "clxprofileuser123" })
  @IsString()
  targetUserId: string;

  @ApiProperty({ enum: DiscoveryAction })
  @IsEnum(DiscoveryAction)
  action: DiscoveryAction;
}
