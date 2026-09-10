import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  // The absolute Pages URL prefixes _next/static requests, so the export works
  // under a repository sub-path such as /little-us/. `basePath` is deliberately
  // not used: vinext then fails to classify `/` and skips prerendering it, so
  // the export ships no index.html. The app is a single route with no internal
  // links, so the asset prefix alone is enough.
  assetPrefix: process.env.PAGES_BASE_URL || '',
};

export default nextConfig;
