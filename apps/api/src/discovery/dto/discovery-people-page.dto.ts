import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class DiscoveryPeoplePageDto {
  @ApiPropertyOptional({ description: "Opaque cursor returned by the previous page" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;
}
