import { Controller, Get, Header } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { DiscoveryService } from "./discovery.service";

@ApiTags("public discovery")
@Controller("public/discovery")
export class PublicDiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get("people")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  getPeople() {
    return this.discoveryService.getPublicPreview();
  }
}
