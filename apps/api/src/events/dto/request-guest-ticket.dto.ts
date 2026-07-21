import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEmail, IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class RequestGuestTicketDto {
  @ApiProperty({ example: "guest@example.com" })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: "Ada Okafor" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName: string;

  @ApiProperty({ example: "cm123tickettype" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  ticketTypeId: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity: number;
}
