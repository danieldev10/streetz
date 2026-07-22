import { IsString, MaxLength, MinLength } from "class-validator";

export class CheckInTicketDto {
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  code!: string;
}
