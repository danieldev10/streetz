import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>("DATABASE_URL")
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    // Ensure PostGIS functions resolve from whichever schema the extension
    // is installed in (Supabase uses "extensions", Railway uses "public").
    await this.$executeRawUnsafe(
      `SET search_path TO public,extensions`
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
