import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class BuyRaffleTicketsDto {
  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 100, description: "Number of raffle tickets to buy in this transaction." })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;
}
