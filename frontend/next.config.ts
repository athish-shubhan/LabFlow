import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the production Docker image.
  output: "standalone",
  experimental: {
    // Data here changes through client mutations; don't serve cached fetch responses
    // to Server Components after a dev hot reload.
    serverComponentsHmrCache: false,
  },
};

export default nextConfig;
