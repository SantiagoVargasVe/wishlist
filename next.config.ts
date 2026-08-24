import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the production image small — see ADR-0007.
  output: "standalone",
};

export default nextConfig;
