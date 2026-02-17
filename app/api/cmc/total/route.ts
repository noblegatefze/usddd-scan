import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function textNoStore(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

export async function GET(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const r = await fetch(`${origin}/api/cmc/supply`, { cache: "no-store" });
    if (!r.ok) return textNoStore(`ERROR ${r.status}`, 500);

    const j = (await r.json()) as any;
    const v = String(j?.total_supply ?? "").trim();
    if (!v || v.toLowerCase() === "undefined") return textNoStore("ERROR missing total_supply", 500);

    // MUST be simple text ONLY: no commas, no quotes, no JSON.
    return textNoStore(v, 200);
  } catch (e: any) {
    return textNoStore(`ERROR ${e?.message ?? "failed"}`, 500);
  }
}
