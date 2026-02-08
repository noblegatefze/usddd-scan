import { NextResponse } from "next/server";

function getTerminalBaseUrl() {
  // If you explicitly run Terminal locally, set:
  // TERMINAL_BASE_URL=http://localhost:3000
  const v = process.env.TERMINAL_BASE_URL;
  if (!v) return null;
  return v.replace(/\/+$/, "");
}

export async function GET() {
  try {
    // In production, always proxy to real Terminal
    if (process.env.NODE_ENV === "production") {
      const r = await fetch(`https://digdug.do/api/flags`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });

      const txt = await r.text();
      return new NextResponse(txt, {
        status: r.status,
        headers: {
          "content-type": r.headers.get("content-type") || "application/json",
          "cache-control": "public, max-age=5, s-maxage=5",
        },
      });
    }

    // DEV: only proxy if Terminal base is explicitly provided.
    // Otherwise fail-closed (paused) to avoid self-call loops.
    const base = getTerminalBaseUrl();
    if (!base) {
      return NextResponse.json(
        {
          ok: true,
          flags: { pause_all: true, pause_reserve: true, pause_stats_ingest: true },
          note: "scan dev: TERMINAL_BASE_URL not set, returning fail-closed flags to avoid self-proxy loop",
        },
        { headers: { "cache-control": "no-store" } }
      );
    }

    const r = await fetch(`${base}/api/flags`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    const txt = await r.text();
    return new NextResponse(txt, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") || "application/json",
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
