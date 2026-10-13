import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { RedisModule } from "../realtime/redis.module";
import { RateLimitsModule } from "../abuse/rate-limits.module";

@Module({
  imports: [RedisModule, RateLimitsModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
