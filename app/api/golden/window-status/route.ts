import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

function jsonNoStore(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

export async function GET() {
  try {
    // (optional) respect maintenance gate if you have it available
    // If rpc_admin_flags exists in scan repo DB, uncomment:
    // const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
    // if (flagsErr) return jsonNoStore({ ok: false, error: flagsErr.message }, 500);
    // const row: any = Array.isArray(flags) ? flags[0] : flags;
    // if (row?.pause_all) return jsonNoStore({ ok: false, paused: true }, 503);

    // 1) Ensure today's windows exist (idempotent)
    const { error: e1 } = await supabase.rpc("rpc_golden_ensure_today_windows", {
      p_cap: 5,
      p_window_minutes: 60,
    });
    if (e1) return jsonNoStore({ ok: false, error: `ensure_windows_failed: ${e1.message}` }, 500);

    // 2) Detect if currently inside a window
    const nowIso = new Date().toISOString();

    const { data, error: e2 } = await supabase
      .from("dd_tg_golden_windows")
      .select("day, slot, opens_at, closes_at, claimed_event_id")
      .lte("opens_at", nowIso)
      .gt("closes_at", nowIso)
      .order("opens_at", { ascending: true })
      .limit(1);

    if (e2) return jsonNoStore({ ok: false, error: `active_window_query_failed: ${e2.message}` }, 500);

    const row = Array.isArray(data) && data.length ? data[0] : null;
    const active = Boolean(row);

    let ends_in_ms = 0;
    if (row?.closes_at) {
      const end = new Date(String(row.closes_at)).getTime();
      const now = Date.now();
      ends_in_ms = Number.isFinite(end) ? Math.max(0, end - now) : 0;
    }

    return jsonNoStore({
      ok: true,
      active,
      now: nowIso,
      row,
      ends_in_ms,
    });
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: String(e?.message ?? e ?? "unknown") }, 500);
  }
}
