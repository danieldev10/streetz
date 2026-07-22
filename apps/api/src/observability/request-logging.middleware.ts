import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(request: Request, response: Response, next: NextFunction) {
    const incoming = request.header("x-request-id")?.trim();
    const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    const startedAt = process.hrtime.bigint();

    response.setHeader("x-request-id", requestId);
    response.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const event = {
        event: "http_request",
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs * 10) / 10
      };

      if (response.statusCode >= 500) this.logger.error(event);
      else if (durationMs >= 1_000) this.logger.warn({ ...event, event: "slow_http_request" });
      else this.logger.log(event);
    });

    next();
  }
}
