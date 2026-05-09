import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
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
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120
      }
    ]),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    PaymentsModule,
    ProfilesModule,
    DiscoveryModule,
    EventsModule,
    MessagesModule,
    RoomsModule,
    NotificationsModule
  ]
})
export class AppModule {}
