import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { ProfilesService } from "./profiles.service";

async function bootstrap() {
  const limit = Number.parseInt(process.argv[2] ?? "50", 10);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"]
  });

  try {
    const profilesService = app.get(ProfilesService, { strict: false });
    const result = await profilesService.backfillMissingPhotoVariants(Number.isFinite(limit) ? limit : 50);

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

void bootstrap();
