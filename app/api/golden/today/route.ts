import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const DAILY_CAP = 5;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET() {
  // Maintenance gate (DB-authoritative)
  const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
  if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
  const row: any = Array.isArray(flags) ? flags[0] : flags;
  if (row && row.pause_all) return NextResponse.json({ ok: false, paused: true }, { status: 503 });

  try {
    const day = todayUTC();

    // dd_tg_golden_events.day is stored as YYYY-MM-DD (text) in terminal DB logic.
    // If it's a date type in your schema, this still works as Supabase will coerce.
    const { count, error } = await supabase
      .from("dd_tg_golden_events")
      .select("id", { count: "exact", head: true })
      .eq("day", day);

    if (error) {
      return NextResponse.json({ ok: false, error: "count_failed", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, day, count: Number(count ?? 0), cap: DAILY_CAP });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "unexpected", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
