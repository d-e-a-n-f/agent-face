import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Next 16 allows one dev server per dist directory. The e2e suite sets
  // NEXT_DIST_DIR so its server (own port, mock adapter baked in) can run
  // alongside a developer's normal `pnpm dev`.
  ...(process.env.NEXT_DIST_DIR !== undefined && process.env.NEXT_DIST_DIR !== ""
    ? { distDir: process.env.NEXT_DIST_DIR }
    : {}),
};

export default nextConfig;
