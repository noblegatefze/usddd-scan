import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function reqEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Maintenance gate (DB-authoritative)
  const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
  if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
  const frow: any = Array.isArray(flags) ? flags[0] : flags;
  if (frow && frow.pause_all) return NextResponse.json({ ok: false, paused: true }, { status: 503 });

  // Canonical money window (24h)
  const { data, error } = await supabase.rpc("rpc_scan_money_24h_canonical");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const row: any = Array.isArray(data) ? data[0] : data;

  const usddd_spent_24h = Number(row?.usddd_spent_24h ?? 0) || 0;
  const spend_rows_24h = Number(row?.spend_rows_24h ?? 0) || 0;

  const avg_usddd_per_success = spend_rows_24h > 0 ? usddd_spent_24h / spend_rows_24h : 0;

  // Strict truth: we do NOT compute "find rate" here because attempts live in telemetry (stats_events).
  return NextResponse.json(
    {
      ok: true,
      usddd_spent_24h,
      spend_rows_24h,
      avg_usddd_per_success,
      note: "Canonical: derived from dd_usddd_spend_ledger (dig spend rows) via rpc_scan_money_24h_canonical.",
    },
    {
      headers: {
        "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    }
  );
}
