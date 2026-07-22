import "dotenv/config";
import * as Sentry from "@sentry/nestjs";

function getSampleRate() {
  const value = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1");
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.1;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE ?? process.env.RAILWAY_GIT_COMMIT_SHA,
  tracesSampleRate: getSampleRate(),
  sendDefaultPii: false,
  enabled: Boolean(process.env.SENTRY_DSN)
});
