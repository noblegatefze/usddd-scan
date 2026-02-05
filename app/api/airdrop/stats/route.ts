import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") || 30);
    const limit = Math.max(10, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 30));

    const { data, error } = await supabase.rpc("rpc_airdrop_stats", { p_limit: limit });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      count: Number(row?.count ?? 0),
      latest: (row?.latest_masked ?? []) as string[],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
