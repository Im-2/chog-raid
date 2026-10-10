import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets the mock demo server (npm run dev:mock) run next to the normal one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    // Tells client code whether Chog names come from the real index or are mock names.
    NEXT_PUBLIC_NFT_MODE: process.env.NFT_ADAPTER ?? (process.env.NEXT_PUBLIC_CHOG_CONTRACT_ADDRESS ? "onchain" : "mock"),
  },
};

export default nextConfig;
