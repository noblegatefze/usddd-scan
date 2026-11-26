import type { NextConfig } from "next";

const destination = "https://fund.digdug.do/";
const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/fund", destination, permanent: false },
      { source: "/fund/access", has: [{ type: "header", key: "sec-fetch-dest", value: "document" }], destination, permanent: false },
      { source: "/fund/access", missing: [{ type: "query", key: "view", value: "home" }], destination, permanent: false },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "fund\\.digdug\\.do" }], destination: "/fund-network" },
      ],
    };
  },
};

export default nextConfig;
