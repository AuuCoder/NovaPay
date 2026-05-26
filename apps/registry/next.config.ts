import type { NextConfig } from "next";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({
  path: path.join(process.cwd(), "..", "..", ".env"),
  override: false,
});

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), "..", ".."),
  async redirects() {
    return [
      {
        source: "/overview",
        destination: "/governance/overview",
        permanent: false,
      },
      {
        source: "/review-queue",
        destination: "/governance/review-queue",
        permanent: false,
      },
      {
        source: "/plugins",
        destination: "/governance/plugins",
        permanent: false,
      },
      {
        source: "/plugins/:slug",
        destination: "/governance/plugins/:slug",
        permanent: false,
      },
      {
        source: "/licenses",
        destination: "/governance/licenses",
        permanent: false,
      },
      {
        source: "/licenses/:id",
        destination: "/governance/licenses/:id",
        permanent: false,
      },
      {
        source: "/payouts",
        destination: "/governance/payouts",
        permanent: false,
      },
      {
        source: "/settlement",
        destination: "/governance/settlement",
        permanent: false,
      },
      {
        source: "/signing-keys",
        destination: "/governance/signing-keys",
        permanent: false,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    }

    return config;
  },
};

export default nextConfig;
