import { NextResponse } from "next/server";

const VERSION = "v0.1.16.5"; // 👈 keep this in sync with digdug.do

function pickBuildSha(): string {
  // Vercel provides different vars depending on environment
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "";

  return sha ? sha.slice(0, 7) : "local";
}

export async function GET() {
  return NextResponse.json({
    version: VERSION,
    build: pickBuildSha(),
    deployed_at: new Date().toISOString(),
  });
}
