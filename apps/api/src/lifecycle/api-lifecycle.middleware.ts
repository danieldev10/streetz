import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { ApiLifecycleService } from "./api-lifecycle.service";

@Injectable()
export class ApiLifecycleMiddleware implements NestMiddleware {
  constructor(private readonly lifecycle: ApiLifecycleService) {}

  use(request: Request, response: Response, next: NextFunction) {
    response.setHeader("X-Crushclub-Instance", this.lifecycle.instanceId);
    // Keep health visible during draining; readiness is already false.
    const health = /^\/api\/health(?:\/(?:live|ready))?\/?$/.test(request.originalUrl.split("?")[0]);
    if (this.lifecycle.isDraining() && !health) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Connection", "close");
      response.setHeader("Retry-After", "1");
      response.status(503).json({ statusCode: 503, message: "This server is restarting. Please retry shortly." });
      return;
    }
    const complete = this.lifecycle.beginWork();
    const finish = () => {
      response.off("finish", finish);
      response.off("close", finish);
      complete();
    };
    response.once("finish", finish);
    response.once("close", finish);
    next();
  }
}
