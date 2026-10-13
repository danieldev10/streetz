require("./register-typescript.cjs");
const test = require("node:test"), assert = require("node:assert/strict");
const { contentSecurityPolicy } = require("../src/lib/content-security-policy.ts");
const { CSP_REPORT_MESSAGE, installCspReporting, sanitizeCspEvent } = require("../src/lib/csp-reporting.ts");

test("CSP initially reports; explicit enforcement retains the required payment/liveness/socket sources", () => {
  const env = { NODE_ENV: "production", NEXT_PUBLIC_SOCKET_URL: "https://api.example.test", NEXT_PUBLIC_MEDIA_CDN_BASE_URL: "https://media.example.test", NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN: "https://bucket.s3.eu-west-1.amazonaws.com", NEXT_PUBLIC_AWS_REKOGNITION_REGION: "eu-west-1", NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123" };
  const report = contentSecurityPolicy(env);
  assert.equal(report.key, "Content-Security-Policy-Report-Only");
  assert.ok(!report.value.includes("'unsafe-eval'"));
  for (const source of ["wss://api.example.test", "https://media.example.test", "https://bucket.s3.eu-west-1.amazonaws.com", "https://cdn.liveness.rekognition.amazonaws.com", "'wasm-unsafe-eval'", "https://js.paystack.co", "https://example.ingest.sentry.io", "frame-ancestors 'none'"]) assert.ok(report.value.includes(source), source);
  assert.ok(!report.value.includes("public@"));
  assert.equal(contentSecurityPolicy({ ...env, CSP_MODE: "enforce" }).key, "Content-Security-Policy");
  assert.equal(contentSecurityPolicy({ CSP_MODE: "off" }), null);
  assert.throws(() => contentSecurityPolicy({ CSP_MODE: "invalid" }));
  assert.throws(() => contentSecurityPolicy({ NEXT_PUBLIC_AWS_REKOGNITION_REGION: "eu-west-1; script-src *" }));
  const bad = contentSecurityPolicy({ ...env, NEXT_PUBLIC_SOCKET_URL: "https://example.test/path;secret" });
  assert.ok(!bad.value.includes("path;secret"));
});

test("CSP telemetry never sends private URLs, samples, referrers or attacker data and stays bounded", () => {
  let callback; const reports = [];
  installCspReporting((detail) => reports.push(detail), { addEventListener(_event, listener) { callback = listener; } });
  const event = { effectiveDirective: "connect-src", disposition: "report", blockedURI: "https://evil.test/private-token", documentURI: "https://site.test/reset?token=secret", sample: "sensitive", referrer: "private" };
  callback(event); callback(event);
  callback({ ...event, effectiveDirective: "attacker-value" });
  assert.deepEqual(reports, [{ directive: "connect-src", disposition: "report" }]);
  for (const directive of ["script-src", "img-src", "font-src", "frame-src", "style-src", "worker-src", "media-src", "object-src", "base-uri", "form-action", "frame-ancestors"]) callback({ ...event, effectiveDirective: directive });
  assert.equal(reports.length, 10);
  assert.ok(!JSON.stringify(reports).includes("secret"));
  const sanitized = sanitizeCspEvent({ message: CSP_REPORT_MESSAGE, tags: reports[0],
    request: { url: "https://site.test/reset?token=secret" }, user: { email: "private@example.test" },
    breadcrumbs: [{ data: { url: "private" } }], extra: { private: "secret" }, contexts: { trace: { data: "private" } } });
  assert.ok(!JSON.stringify(sanitized).includes("secret"));
  assert.equal(sanitized.request, undefined);
  assert.equal(sanitized.breadcrumbs, undefined);
  assert.deepEqual(sanitized.tags, reports[0]);
});
