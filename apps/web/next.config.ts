import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      },
      {
        protocol: "https",
        hostname: "**.amazonaws.com"
      },
      {
        protocol: "https",
        hostname: "**.cloudfront.net"
      }
    ]
  }
};

export default nextConfig;
