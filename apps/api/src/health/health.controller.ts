import { Controller, Get, Header, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  check() {
    return {
      status: "ok",
      service: "crushclub-api",
      timestamp: new Date().toISOString()
    };
  }

  @Get("live")
  @Header("Cache-Control", "no-store")
  live() {
    return this.check();
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  async ready() {
    if (!await this.health.isReady()) {
      throw new ServiceUnavailableException({ status: "unavailable", service: "crushclub-api" });
    }
    return this.check();
  }
}
