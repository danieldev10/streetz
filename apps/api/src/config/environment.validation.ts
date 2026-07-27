const REQUIRED_PRODUCTION_KEYS = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "WEB_APP_URL",
  "REDIS_URL",
  "PAYSTACK_SECRET_KEY",
  "SMTP_HOST",
  "SMTP_FROM"
] as const;

function read(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasAny(config: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => Boolean(read(config, key)));
}

function requireAny(config: Record<string, unknown>, keys: string[], label: string, errors: string[]) {
  if (!hasAny(config, keys)) errors.push(`${label} (${keys.join(" or ")})`);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateInteger(
  config: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  errors: string[]
) {
  const rawValue = read(config, key);

  if (!rawValue) {
    return;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
}

export function validateEnvironment(config: Record<string, unknown>) {
  const errors: string[] = [];
  const nodeEnv = read(config, "NODE_ENV") || "development";

  if (!["development", "test", "production"].includes(nodeEnv)) {
    errors.push("NODE_ENV must be development, test, or production");
  }

  const webAppUrl = read(config, "WEB_APP_URL");
  if (webAppUrl && !isHttpUrl(webAppUrl)) errors.push("WEB_APP_URL must be an http(s) URL");

  const smtpPort = read(config, "SMTP_PORT");
  if (smtpPort && (!/^\d+$/.test(smtpPort) || Number(smtpPort) < 1 || Number(smtpPort) > 65_535)) {
    errors.push("SMTP_PORT must be a valid TCP port");
  }

  validateInteger(config, "DB_POOL_MAX", 1, 50, errors);
  validateInteger(config, "DB_POOL_CONNECTION_TIMEOUT_MS", 100, 60_000, errors);
  validateInteger(config, "DB_POOL_IDLE_TIMEOUT_MS", 1_000, 600_000, errors);
  validateInteger(config, "DB_POOL_MAX_LIFETIME_SECONDS", 60, 86_400, errors);
  validateInteger(config, "DB_STATEMENT_TIMEOUT_MS", 1_000, 120_000, errors);

  const faceMode = read(config, "FACE_VERIFICATION_MODE") || "off";
  if (!["off", "observe", "prototype-pass", "enforce"].includes(faceMode)) {
    errors.push("FACE_VERIFICATION_MODE must be off, observe, prototype-pass, or enforce");
  }

  const accessKeyConfigured = hasAny(config, ["AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID"]);
  const secretKeyConfigured = hasAny(config, ["AWS_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY"]);
  if (accessKeyConfigured !== secretKeyConfigured) errors.push("AWS/S3 access key and secret key must be configured together");

  if (nodeEnv === "production") {
    for (const key of REQUIRED_PRODUCTION_KEYS) {
      if (!read(config, key)) errors.push(key);
    }

    requireAny(config, ["AWS_S3_BUCKET", "AWS_S3_BUCKET_NAME", "S3_BUCKET", "S3_BUCKET_NAME"], "media bucket", errors);
    requireAny(config, ["AWS_REGION", "AWS_DEFAULT_REGION", "S3_REGION"], "media region", errors);
    requireAny(
      config,
      ["MEDIA_CDN_BASE_URL", "CLOUDFRONT_BASE_URL", "AWS_CLOUDFRONT_URL", "S3_PUBLIC_BASE_URL", "AWS_S3_PUBLIC_BASE_URL"],
      "stable media CDN URL",
      errors
    );

    if (faceMode !== "off") {
      requireAny(config, ["AWS_VERIFICATION_BUCKET", "FACE_VERIFICATION_BUCKET"], "face-verification bucket", errors);
    }

    const faceRequired = ["1", "true", "yes", "on"].includes(read(config, "FACE_VERIFICATION_REQUIRED").toLowerCase());
    if (faceRequired && faceMode === "off") errors.push("FACE_VERIFICATION_REQUIRED cannot be true when FACE_VERIFICATION_MODE is off");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join(", ")}`);
  }

  return config;
}
