import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ApiLifecycleService } from "./api-lifecycle.service";
import { ApiWorkInterceptor } from "./api-work.interceptor";

@Global()
@Module({
  providers: [ApiLifecycleService, { provide: APP_INTERCEPTOR, useClass: ApiWorkInterceptor }],
  exports: [ApiLifecycleService]
})
export class ApiLifecycleModule {}
