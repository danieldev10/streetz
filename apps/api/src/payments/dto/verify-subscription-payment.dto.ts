import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class VerifySubscriptionPaymentDto {
  @ApiProperty({ example: "STZSUB-1714320000000-a1b2c3d4" })
  @IsString()
  @Matches(/^[A-Za-z0-9\-.=]+$/)
  reference: string;
}
