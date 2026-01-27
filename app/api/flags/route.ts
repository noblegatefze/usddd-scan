import { NextResponse } from "next/server";

function upstreamBase() {
  // In dev, Scan runs on 3001 and Terminal runs on 3000
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return "https://digdug.do";
}

export async function GET() {
  try {
    const r = await fetch(`${upstreamBase()}/api/flags`, {
      cache: "no-store",
      // avoid Next caching surprises
      headers: { "accept": "application/json" },
    });

    const txt = await r.text(); // pass through body as-is
    return new NextResponse(txt, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") || "application/json",
        // cache a little, same as terminal
        "cache-control": "public, max-age=5, s-maxage=5",
      },
    });
  } catch {
    // fail-closed
    return NextResponse.json(
      {
        ok: true,
        flags: { pause_all: true, pause_reserve: true, pause_stats_ingest: true },
      },
      { headers: { "cache-control": "public, max-age=5, s-maxage=5" } }
    );
  }
}
