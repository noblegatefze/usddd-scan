import { NextResponse } from "next/server";

const FALLBACK_VERSION = "__sync"; // only used if digdug.do is unreachable

function pickBuildSha(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "";
  return sha ? sha.slice(0, 7) : "local";
}

export async function GET() {
  let terminal_version = FALLBACK_VERSION;

  try {
    const r = await fetch("https://digdug.do/api/meta/build", {
      cache: "no-store",
    });
    if (r.ok) {
      const j = await r.json();
      if (typeof j?.version === "string" && j.version.length > 0) {
        terminal_version = j.version;
      }
    }
  } catch {
    // keep fallback
  }

  return NextResponse.json({
    version: terminal_version, // Scan now mirrors Terminal automatically
    build: pickBuildSha(),
    deployed_at: new Date().toISOString(),
  });
}
