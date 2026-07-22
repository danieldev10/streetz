const assert = require("node:assert/strict");
const test = require("node:test");
const { validateEnvironment } = require("../dist/src/config/environment.validation.js");

function productionEnvironment(overrides = {}) {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://example.invalid/streetz",
    JWT_ACCESS_SECRET: "access-secret",
    JWT_REFRESH_SECRET: "refresh-secret",
    WEB_APP_URL: "https://crushclub.example",
    REDIS_URL: "redis://example.invalid:6379",
    PAYSTACK_SECRET_KEY: "paystack-secret",
    SMTP_HOST: "smtp.example.invalid",
    SMTP_FROM: "crushclub <hello@example.invalid>",
    S3_BUCKET: "media-bucket",
    S3_REGION: "eu-west-1",
    MEDIA_CDN_BASE_URL: "https://media.example.invalid",
    FACE_VERIFICATION_MODE: "off",
    ...overrides
  };
}

test("production environment accepts the complete minimum configuration", () => {
  const environment = productionEnvironment();
  assert.equal(validateEnvironment(environment), environment);
});

test("production environment fails fast with every missing critical key named", () => {
  assert.throws(
    () => validateEnvironment(productionEnvironment({ DATABASE_URL: "", REDIS_URL: "", SMTP_HOST: "" })),
    /DATABASE_URL, REDIS_URL, SMTP_HOST/
  );
});

test("enabled face verification requires its audit bucket", () => {
  assert.throws(
    () => validateEnvironment(productionEnvironment({ FACE_VERIFICATION_MODE: "enforce" })),
    /face-verification bucket/
  );
});

test("development remains usable without production integrations", () => {
  const environment = { NODE_ENV: "development", WEB_APP_URL: "http://localhost:3000" };
  assert.equal(validateEnvironment(environment), environment);
});
