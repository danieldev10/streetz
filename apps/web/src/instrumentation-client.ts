import * as Sentry from "@sentry/nextjs";
import { getSentryTraceSampleRate } from "./sentry-options";
import { CSP_REPORT_MESSAGE, installCspReporting, sanitizeCspEvent } from "./lib/csp-reporting";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: getSentryTraceSampleRate(),
  sendDefaultPii: false,
  beforeSend: sanitizeCspEvent
});

installCspReporting((detail) => {
  Sentry.captureMessage(CSP_REPORT_MESSAGE, { level: "warning", tags: detail });
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
