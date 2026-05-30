import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { CreateEventDto } from "./create-event.dto";

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @ApiPropertyOptional({ example: "Venue emergency closure.", description: "Required when cancelling an event." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;
}
