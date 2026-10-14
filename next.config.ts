import type { NextConfig } from "next";

const authApiUrl = process.env.AUTH_API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{
      source: "/api/auth/:path*",
      destination: `${authApiUrl.replace(/\/$/, "")}/auth/:path*`,
    }];
  },
};

export default nextConfig;
