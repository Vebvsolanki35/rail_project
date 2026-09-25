import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Dev-server origin allow-list. The app is served through the sandbox preview
   * proxy (https://<port>-<id>.e2b.app), so Next must accept that Host for
   * dev-time asset and RSC requests. Production builds are unaffected.
   */
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],
};

export default nextConfig;
