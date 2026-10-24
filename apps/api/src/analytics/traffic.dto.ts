import { IsIn, IsOptional, IsUUID } from "class-validator";

export const PAGE_KINDS = ["LANDING", "LOGIN", "SIGNUP", "OTHER"] as const;
export class PageViewDto {
  @IsUUID("4")
  eventId: string;

  @IsUUID("4")
  visitId: string;

  @IsIn(PAGE_KINDS)
  pageKind: (typeof PAGE_KINDS)[number];
}

export const TRAFFIC_PERIODS = ["all", "today", "7d", "30d"] as const;
export type TrafficPeriod = (typeof TRAFFIC_PERIODS)[number];
export class TrafficQueryDto {
  @IsOptional()
  @IsIn(TRAFFIC_PERIODS)
  period?: TrafficPeriod;
}
