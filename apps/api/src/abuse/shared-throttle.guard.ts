import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectThrottlerOptions, InjectThrottlerStorage, ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage, ThrottlerException } from "@nestjs/throttler";
import type { Request, Response } from "express";

@Injectable()
export class SharedThrottleGuard extends ThrottlerGuard {
  constructor(@InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage, reflector: Reflector) {
    super(options, storage, reflector);
  }
  async canActivate(context: ExecutionContext) {
    if (context.getType() !== "http") return true;
    await super.canActivate(context);
    const action = `${context.getClass().name}:${context.getHandler().name}`;
    const rules: Record<string, [number, number]> = {
      "AuthController:login": [15, 60_000],
      "AuthController:register": [5, 900_000],
      "AuthController:forgotPassword": [3, 900_000],
      "EventsController:requestGuestTicket": [5, 900_000],
    };
    const rule = rules[action];
    const req = context.switchToHttp().getRequest<Request>();
    const email: unknown = req.body?.email;
    if (rule && typeof email === "string" && email.length <= 254) {
      // Per-account counters complement IP limits when attackers change IPs.
      const [limit, ttl] = rule;
      const result = await this.storageService.increment(`account:${action}:${email.trim().toLowerCase()}`, ttl, limit, ttl, "account");
      if (result.isBlocked) {
        context.switchToHttp().getResponse<Response>().header("Retry-After", String(result.timeToBlockExpire));
        throw new ThrottlerException("Too many attempts. Please try again later.");
      }
    }
    return true;
  }
}
