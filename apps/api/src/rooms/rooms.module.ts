import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt/dist";
import { StorageModule } from "../storage/storage.module";
import { RoomsController } from "./rooms.controller";
import { RoomsGateway } from "./rooms.gateway";
import { RoomsService } from "./rooms.service";

@Module({
  imports: [JwtModule.register({}), StorageModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsGateway],
  exports: [RoomsService]
})
export class RoomsModule {}
