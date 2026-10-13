type Environment = Record<string, string | undefined>;

function origins(values: (string | undefined)[]) {
  return [...new Set(values.flatMap((value) => {
    if (!value) return [];
    try {
      const url = new URL(value);
      return ["https:", "http:", "wss:", "ws:"].includes(url.protocol) ? [url.origin] : [];
    } catch { return []; }
  }))];
}

export function contentSecurityPolicy(env: Environment) {
  const mode = env.CSP_MODE ?? "report-only";
  if (!["off", "report-only", "enforce"].includes(mode)) throw new Error("CSP_MODE must be off, report-only, or enforce");
  if (mode === "off") return null;
  const development = env.NODE_ENV !== "production";
  const region = env.NEXT_PUBLIC_AWS_REKOGNITION_REGION ?? env.NEXT_PUBLIC_AWS_LIVENESS_IDENTITY_POOL_ID?.split(":")[0] ?? "eu-west-1";
  if (!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(region)) throw new Error("Invalid public AWS region for CSP");
  const apiOrigins = origins([env.NEXT_PUBLIC_API_URL, env.NEXT_PUBLIC_SOCKET_URL]);
  const sockets = apiOrigins.map((origin) => origin.replace(/^http/, "ws"));
  const media = origins([env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL, env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN,
    env.NEXT_PUBLIC_CLOUDFRONT_BASE_URL, env.MEDIA_CDN_BASE_URL, env.CLOUDFRONT_BASE_URL,
    env.AWS_CLOUDFRONT_URL, env.S3_PUBLIC_BASE_URL, env.AWS_S3_PUBLIC_BASE_URL]);
  const bucket = env.S3_BUCKET ?? env.AWS_S3_BUCKET ?? env.AWS_S3_BUCKET_NAME ?? env.S3_BUCKET_NAME;
  const mediaRegion = env.S3_REGION ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "eu-north-1";
  const uploads = origins([env.NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN,
    bucket ? `https://${bucket}.s3.${mediaRegion}.amazonaws.com` : undefined]);
  const giphy = ["media", "media0", "media1", "media2", "media3", "media4"].map((name) => `https://${name}.giphy.com`);
  const sentry = origins([env.NEXT_PUBLIC_SENTRY_DSN, env.SENTRY_DSN]);
  // Next's static hydration currently needs inline scripts. This first rollout
  // limits external sources; removing unsafe-inline requires a separate nonce/
  // hash rendering decision. Report-only is deliberately the initial default.
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://maps.gstatic.com https://js.paystack.co https://cdn.liveness.rekognition.amazonaws.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: ${media.join(" ")} ${giphy.join(" ")} https://images.unsplash.com https://maps.googleapis.com https://maps.gstatic.com`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${apiOrigins.join(" ")} ${sockets.join(" ")} ${media.join(" ")} ${uploads.join(" ")} ${sentry.join(" ")} https://api.giphy.com https://maps.googleapis.com https://cdn.liveness.rekognition.amazonaws.com https://cognito-identity.${region}.amazonaws.com https://rekognition.${region}.amazonaws.com https://rekognition-streaming.${region}.amazonaws.com wss://rekognition-streaming.${region}.amazonaws.com https://sts.${region}.amazonaws.com${development ? " http://localhost:4000 ws://localhost:4000 http://127.0.0.1:4000 ws://127.0.0.1:4000" : ""}`,
    "frame-src 'self' https://checkout.paystack.com https://checkout.paystack.co https://*.paystack.co",
    "worker-src 'self' blob:", "media-src 'self' blob: data:", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ];
  if (!development) directives.push("upgrade-insecure-requests");
  return { key: mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: directives.join("; ").replace(/\s+/g, " ").trim() };
}
