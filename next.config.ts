import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets the mock demo server (npm run dev:mock) run next to the normal one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
