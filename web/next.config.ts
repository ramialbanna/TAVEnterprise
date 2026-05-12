import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Pin the workspace root so Turbopack stops inferring it from a parent lockfile
  // (this repo's root has its own package.json for the Cloudflare Worker).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
