import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with only the files and deps the server actually
  // needs, so the runtime image doesn't carry node_modules or build tooling.
  output: "standalone",
};

export default nextConfig;
