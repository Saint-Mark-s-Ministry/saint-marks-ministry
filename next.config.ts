import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@stmark/contracts', '@stmark/domain'],
  turbopack: {
    // Keep builds rooted in this app when a parent directory has another lockfile.
    root: process.cwd(),
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
