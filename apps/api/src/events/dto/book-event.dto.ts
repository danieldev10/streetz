import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class BookEventDto {
  @ApiPropertyOptional({ example: "clx..." })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ticketTypeId?: string;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  quantity?: number;
}
