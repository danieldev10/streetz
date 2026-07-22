export function getSentryTraceSampleRate() {
  const value = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1");
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.1;
}
