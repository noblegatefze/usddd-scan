import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function reqEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function GET() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!SUPABASE_URL) return NextResponse.json({ ok: false, error: "missing_supabase_url" }, { status: 500 });
  if (!SUPABASE_KEY) return NextResponse.json({ ok: false, error: "missing_service_role" }, { status: 500 });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("dd_activity_window_snapshot")
    .select("*")
    .eq("key", "activity_1h")
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: { "cache-control": "no-store" } });
  }

  if (!data) {
    return NextResponse.json({ ok: true, mode: "empty_snapshot", row: null }, { status: 200, headers: { "cache-control": "no-store" } });
  }

  return NextResponse.json(
    { ok: true, mode: "snapshot_1h", row: data },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
