import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { RedisModule } from "../realtime/redis.module";

@Module({
  imports: [RedisModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
