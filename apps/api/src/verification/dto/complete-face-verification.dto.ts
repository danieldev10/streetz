import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class CompleteFaceVerificationDto {
  @ApiProperty({ example: "cmx7..." })
  @IsString()
  attemptId: string;
}
