import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { DiscoveryGender } from "@prisma/client";
import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, Max, Min } from "class-validator";

export class UpdateDiscoveryPreferenceDto {
  @ApiProperty({ enum: DiscoveryGender })
  @IsEnum(DiscoveryGender)
  discoveryGender: DiscoveryGender;

  @ApiProperty({ default: true })
  @IsBoolean()
  showGender: boolean;

  @ApiProperty({ enum: DiscoveryGender, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(DiscoveryGender, { each: true })
  interestedInGenders: DiscoveryGender[];

  @ApiProperty({ minimum: 18, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(100)
  minAge: number;

  @ApiProperty({ minimum: 18, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(18)
  @Max(100)
  maxAge: number;
}
