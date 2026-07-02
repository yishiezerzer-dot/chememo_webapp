import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portability guardrail: standalone output makes Dockerfile / `next start`
  // deploys trivial on Railway (or Render/Fly as fallback hosts).
  output: "standalone",
};

export default nextConfig;
