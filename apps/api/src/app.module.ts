import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { ThrottlerModule } from "@nestjs/throttler";
import { RateLimitsModule } from "./abuse/rate-limits.module";
import { RedisRateLimitStore } from "./abuse/redis-rate-limit.store";
import { SharedThrottleGuard } from "./abuse/shared-throttle.guard";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { DiscoveryModule } from "./discovery/discovery.module";
import { EventsModule } from "./events/events.module";
import { HealthModule } from "./health/health.module";
import { MessagesModule } from "./messages/messages.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PaymentsModule } from "./payments/payments.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RoomsModule } from "./rooms/rooms.module";
import { SupportModule } from "./support/support.module";
import { UsersModule } from "./users/users.module";
import { TicketsModule } from "./tickets/tickets.module";
import { validateEnvironment } from "./config/environment.validation";
import { RequestLoggingMiddleware } from "./observability/request-logging.middleware";
import { ApiLifecycleModule } from "./lifecycle/api-lifecycle.module";
import { ApiLifecycleMiddleware } from "./lifecycle/api-lifecycle.middleware";
import { TrafficModule } from "./analytics/traffic.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === "test",
      validate: validateEnvironment
    }),
    SentryModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RateLimitsModule], inject: [RedisRateLimitStore],
      useFactory: (storage: RedisRateLimitStore) => ({
        storage, throttlers: [{ ttl: 60_000, limit: 120 }],
      }),
    }),
    PrismaModule,
    ApiLifecycleModule,
    HealthModule,
    UsersModule,
    AuthModule,
    PaymentsModule,
    ProfilesModule,
    DiscoveryModule,
    EventsModule,
    TicketsModule,
    MessagesModule,
    RoomsModule,
    AdminModule,
    TrafficModule,
    SupportModule,
    NotificationsModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter
    },
    {
      provide: APP_GUARD,
      useClass: SharedThrottleGuard
    }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiLifecycleMiddleware, RequestLoggingMiddleware).forRoutes("*");
  }
}
