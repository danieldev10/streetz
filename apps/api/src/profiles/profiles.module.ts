import { Module } from "@nestjs/common";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { StorageModule } from "../storage/storage.module";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";

@Module({
  imports: [StorageModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ActiveSubscriptionGuard]
})
export class ProfilesModule {}
