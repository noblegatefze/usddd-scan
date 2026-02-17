import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET() {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL) return json({ ok: false, error: "missing_supabase_url" }, 500);
    if (!SUPABASE_KEY) return json({ ok: false, error: "missing_service_role" }, 500);

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await sb
      .from("dd_activity_window_snapshot")
      .select("*")
      .eq("key", "activity_24h")
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, mode: "snapshot_24h", row: data ?? null }, 200);
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
