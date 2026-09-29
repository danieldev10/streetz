import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { RoomsController } from "./rooms.controller";
import { PublicRoomsGateway } from "./public-rooms.gateway";
import { RoomsGateway } from "./rooms.gateway";
import { RoomsService } from "./rooms.service";

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [RoomsController],
  providers: [RoomsService, PublicRoomsGateway, RoomsGateway],
  exports: [RoomsService]
})
export class RoomsModule {}
