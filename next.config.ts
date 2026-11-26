import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "fund\\.digdug\\.do" }], destination: "/fund" },
      ],
    };
  },
};

export default nextConfig;
