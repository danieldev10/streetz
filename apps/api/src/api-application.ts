import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import compression = require("compression");
import helmet from "helmet";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./realtime/redis-io.adapter";
import { RedisConnectionsService } from "./realtime/redis-connections.service";
import { ApiLifecycleService } from "./lifecycle/api-lifecycle.service";
import { StructuredLogger } from "./observability/structured-logger";
import { browserOrigins } from "./auth/browser-origins";

export async function createApiApplication() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    ...(process.env.NODE_ENV === "production" ? { logger: new StructuredLogger() } : {})
  });
  const config = app.get(ConfigService);
  const webAppUrl = config.getOrThrow<string>("WEB_APP_URL");

  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: browserOrigins(webAppUrl, config.get<string>("AUTH_ALLOWED_ORIGINS")),
    credentials: true,
    exposedHeaders: ["X-Crushclub-Instance"]
  });
  const redisIoAdapter = new RedisIoAdapter(app, config, app.get(RedisConnectionsService), app.get(ApiLifecycleService));
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
  app.use(compression());
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  const enableSwagger = config.get<string>("NODE_ENV") === "development" || config.get<string>("ENABLE_SWAGGER") === "true";

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("crushclub API")
      .setDescription("API contract for the crushclub prototype.")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  return { app, config, adapter: redisIoAdapter };
}
