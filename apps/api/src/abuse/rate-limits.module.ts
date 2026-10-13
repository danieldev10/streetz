import { Module } from "@nestjs/common";
import { RedisRateLimitStore } from "./redis-rate-limit.store";

@Module({ providers: [RedisRateLimitStore], exports: [RedisRateLimitStore] })
export class RateLimitsModule {}
