import type { NextConfig } from "next";

// Baked into the bundle at build time. VERCEL_GIT_COMMIT_SHA is provided by Vercel
// on every deploy; falls back to "dev" for local builds. The client compares its
// baked-in SHA against the live server's (via /api/version) to detect stale code.
const buildSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7);
const buildTime = new Date().toISOString();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime
  }
};

export default nextConfig;
