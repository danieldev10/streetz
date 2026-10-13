import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { browserOrigins } from "../browser-origins";
import type { Request } from "express";

@Injectable()
export class BrowserOriginGuard implements CanActivate {
  private readonly allowed: Set<string>;
  constructor(config: ConfigService) {
    this.allowed = new Set(browserOrigins(config.getOrThrow<string>("WEB_APP_URL"), config.get<string>("AUTH_ALLOWED_ORIGINS")));
  }
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    // Both the new custom header and the existing JSON client force a CORS
    // preflight. Accept JSON during rollout so cached website bundles continue
    // working; always check the source too, including same-site subdomains.
    const client = request.headers["x-crushclub-client"];
    const json = request.headers["content-type"]?.split(";")[0].trim().toLowerCase() === "application/json";
    if ((client !== undefined && client !== "web") || (client !== "web" && !json)) this.reject();
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    let source: string | undefined;
    try {
      if (origin !== undefined) {
        if (typeof origin !== "string" || !this.allowed.has(origin)) this.reject();
        source = origin;
      } else if (typeof referer === "string") {
        source = new URL(referer).origin;
      }
    } catch { this.reject(); }
    if (!source || !this.allowed.has(source)) this.reject();
    return true;
  }
  private reject(): never { throw new ForbiddenException("This authentication request must come from a trusted website."); }
}
