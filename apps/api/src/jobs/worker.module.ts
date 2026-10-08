import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnvironment } from "../config/environment.validation";
import { PrismaModule } from "../prisma/prisma.module";
import { MailModule } from "../mail/mail.module";
import { PaymentsService } from "../payments/payments.service";
import { TicketDeliveryService } from "../tickets/ticket-delivery.service";
import { JobsModule } from "./jobs.module";
import { JobHandlerService } from "./job-handler.service";
import { BackgroundWorkerService } from "./background-worker.service";
import { WorkerHealthController } from "./worker-health.controller";

// Import providers only: the worker exposes no user/payment/socket routes.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    MailModule,
    JobsModule,
  ],
  providers: [
    PaymentsService,
    TicketDeliveryService,
    JobHandlerService,
    BackgroundWorkerService,
  ],
  controllers: [WorkerHealthController],
})
export class WorkerModule {}
