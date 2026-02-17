import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);

  const secret = process.env.CRON_SECRET || "";
  if (secret) {
    const got = url.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
    if (got !== secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL) return NextResponse.json({ ok: false, error: "missing_supabase_url" }, { status: 500 });
  if (!SUPABASE_KEY) return NextResponse.json({ ok: false, error: "missing_service_role" }, { status: 500 });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const r1 = await sb.rpc("rpc_refresh_activity_window_snapshot", { p_key: "activity_1h", p_hours: 1 });
  const r6 = await sb.rpc("rpc_refresh_activity_window_snapshot", { p_key: "activity_6h", p_hours: 6 });

  return NextResponse.json(
    {
      ok: true,
      refreshed: {
        activity_1h: r1.error ? { ok: false, error: r1.error.message } : r1.data,
        activity_6h: r6.error ? { ok: false, error: r6.error.message } : r6.data,
      },
    },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
