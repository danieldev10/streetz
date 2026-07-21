import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, Matches } from "class-validator";

export class ConfirmGuestTicketDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  requestId: string;

  @ApiProperty({ example: "184205" })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
