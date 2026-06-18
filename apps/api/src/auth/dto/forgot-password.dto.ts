import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, MaxLength } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({ example: "ada@crushclub.ng" })
  @IsEmail()
  @MaxLength(254)
  email: string;
}
