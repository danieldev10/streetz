import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { NotificationKind } from "@prisma/client";
import { ArrayMaxSize, IsArray, IsEnum, IsString, ValidateNested } from "class-validator";

class NotificationSeenItemDto {
  @ApiProperty({ enum: NotificationKind, example: NotificationKind.ROOM_CREATED })
  @IsEnum(NotificationKind)
  kind: NotificationKind;

  @ApiProperty({ example: "clxroom123" })
  @IsString()
  entityId: string;
}

export class MarkNotificationsSeenDto {
  @ApiProperty({ type: [NotificationSeenItemDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => NotificationSeenItemDto)
  items: NotificationSeenItemDto[];
}
