import { ApiProperty } from "@nestjs/swagger";
import { Equals, IsBoolean, IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "ada@crushclub.ng" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "Ada" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName: string;

  @ApiProperty({ example: "StrongPass123!" })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: true, description: "Confirms the user is 18 years or older." })
  @IsBoolean()
  @Equals(true, { message: "You must confirm you are 18 or older to create an account." })
  ageConfirmed: boolean;
}
