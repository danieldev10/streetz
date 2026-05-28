import type { NextConfig } from "next";

type ImageRemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

function getEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function getEnvValues(...names: string[]) {
  return names.map((name) => process.env[name]?.trim()).filter((value): value is string => Boolean(value));
}

function getRemotePatternFromUrl(value: string | null): ImageRemotePattern | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const protocol = url.protocol.replace(":", "");

    if (protocol !== "http" && protocol !== "https") {
      return null;
    }

    const basePath = url.pathname.replace(/\/+$/, "");

    return {
      protocol,
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      ...(basePath ? { pathname: `${basePath}/**` } : {})
    };
  } catch {
    return null;
  }
}

function getS3RemotePattern() {
  const bucket = getEnv("AWS_S3_BUCKET", "AWS_S3_BUCKET_NAME", "S3_BUCKET", "S3_BUCKET_NAME");

  if (!bucket) {
    return null;
  }

  const region = getEnv("AWS_REGION", "AWS_DEFAULT_REGION", "S3_REGION") ?? "eu-north-1";

  return getRemotePatternFromUrl(`https://${bucket}.s3.${region}.amazonaws.com`);
}

function uniqueRemotePatterns(patterns: ImageRemotePattern[]) {
  const seen = new Set<string>();

  return patterns.filter((pattern) => {
    const key = `${pattern.protocol ?? ""}:${pattern.hostname}:${pattern.port ?? ""}:${pattern.pathname ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

const imageRemotePatterns = uniqueRemotePatterns(
  [
    {
      protocol: "https",
      hostname: "images.unsplash.com"
    },
    ...getEnvValues(
      "NEXT_PUBLIC_MEDIA_CDN_ORIGIN",
      "NEXT_PUBLIC_MEDIA_CDN_BASE_URL",
      "NEXT_PUBLIC_CLOUDFRONT_BASE_URL",
      "MEDIA_CDN_BASE_URL",
      "CLOUDFRONT_BASE_URL",
      "AWS_CLOUDFRONT_URL",
      "S3_PUBLIC_BASE_URL",
      "AWS_S3_PUBLIC_BASE_URL"
    ).map((value) => getRemotePatternFromUrl(value)),
    getS3RemotePattern()
  ].filter((pattern): pattern is ImageRemotePattern => Boolean(pattern))
);

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload"
          }
        ]
      }
    ];
  },
  images: {
    remotePatterns: imageRemotePatterns
  }
};

export default nextConfig;
