import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, MaxLength } from "class-validator";

export class PresignProfilePhotoDto {
  @ApiProperty({ example: "profile.jpg" })
  @IsString()
  @MaxLength(160)
  fileName: string;

  @ApiProperty({ example: "image/jpeg", enum: ["image/jpeg", "image/png", "image/webp"] })
  @IsString()
  @IsIn(["image/jpeg", "image/png", "image/webp"])
  contentType: string;
}
