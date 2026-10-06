import { AccountStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class AdminUsersListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @IsOptional()
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn([AccountStatus.ACTIVE, AccountStatus.DEACTIVATED, AccountStatus.SUSPENDED, AccountStatus.BANNED])
  status?: AccountStatus;
}
