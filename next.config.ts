import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/fund",
        missing: [{ type: "query", key: "legacy", value: "1" }],
        destination: "https://fund.digdug.do/",
        permanent: false,
      },
      {
        source: "/observatory",
        has: [{ type: "host", value: "fund\\.digdug\\.do" }],
        destination: "https://usddd.digdug.do/",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "fund\\.digdug\\.do" }], destination: "/fund" },
      ],
    };
  },
};

export default nextConfig;
