import { Module } from "@nestjs/common";
import { AdminTrafficController, TrafficController } from "./traffic.controller";
import { TrafficService } from "./traffic.service";

@Module({ controllers: [TrafficController, AdminTrafficController], providers: [TrafficService] })
export class TrafficModule {}
