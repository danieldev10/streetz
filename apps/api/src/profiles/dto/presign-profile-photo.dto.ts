import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from "class-validator";
import { PROFILE_PHOTO_UPLOAD_MAX_BYTES } from "../../storage/upload-limits";

export class PresignProfilePhotoDto {
  @ApiProperty({ example: "profile.jpg" })
  @IsString()
  @MaxLength(160)
  fileName: string;

  @ApiProperty({ example: "image/jpeg", enum: ["image/jpeg", "image/png", "image/webp"] })
  @IsString()
  @IsIn(["image/jpeg", "image/png", "image/webp"])
  contentType: string;

  @ApiProperty({ example: 1048576, maximum: PROFILE_PHOTO_UPLOAD_MAX_BYTES })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PROFILE_PHOTO_UPLOAD_MAX_BYTES)
  fileSizeBytes: number;
}
