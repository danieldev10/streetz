import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsLatitude, IsLongitude } from "class-validator";

export class ReverseGeocodeDto {
  @ApiProperty({ example: 6.5244 })
  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 3.3792 })
  @Type(() => Number)
  @IsLongitude()
  longitude: number;
}
