import type { ErrorEvent } from "@sentry/nextjs";

export const CSP_REPORT_MESSAGE = "Browser content security policy violation";
type SafeReport = { directive: string; disposition: string };
const DIRECTIVES = new Set(["default-src", "script-src", "script-src-elem", "script-src-attr", "style-src",
  "style-src-elem", "style-src-attr", "img-src", "font-src", "connect-src", "frame-src", "worker-src",
  "media-src", "object-src", "base-uri", "form-action", "frame-ancestors"]);

export function installCspReporting(report: (detail: SafeReport) => void, target: Pick<Window, "addEventListener"> = window) {
  const seen = new Set<string>();
  target.addEventListener("securitypolicyviolation", (event: SecurityPolicyViolationEvent) => {
    if (!DIRECTIVES.has(event.effectiveDirective) || !["report", "enforce"].includes(event.disposition)) return;
    const key = `${event.effectiveDirective}:${event.disposition}`;
    if (seen.has(key) || seen.size >= 10) return;
    seen.add(key);
    // Never send document URLs, private ticket/reset query strings, referrers,
    // script samples, or attacker-controlled blocked URIs to monitoring.
    report({ directive: event.effectiveDirective, disposition: event.disposition });
  });
}

export function sanitizeCspEvent(event: ErrorEvent): ErrorEvent {
  if (event.message !== CSP_REPORT_MESSAGE) return event;
  // Sentry can add the current URL and navigation/fetch breadcrumbs itself.
  // CSP reports only need the policy directive and deployment identity.
  return {
    type: undefined,
    event_id: event.event_id, timestamp: event.timestamp, platform: "javascript",
    message: CSP_REPORT_MESSAGE, level: "warning", environment: event.environment,
    release: event.release,
    tags: { directive: event.tags?.directive, disposition: event.tags?.disposition },
  };
}
