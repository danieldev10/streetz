import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { from, lastValueFrom } from "rxjs";
import { ApiLifecycleService } from "./api-lifecycle.service";

@Injectable()
export class ApiWorkInterceptor implements NestInterceptor {
  constructor(private readonly lifecycle: ApiLifecycleService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== "http") return next.handle();
    // Keep tracking the actual handler even if the HTTP client disconnects.
    // A payment transaction must finish before Prisma is disposed.
    return from(this.lifecycle.track(() => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}
