import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../_lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    // 1) Ensure today's windows exist (idempotent)
    const { error: e1 } = await supabaseAdmin.rpc("rpc_golden_ensure_today_windows", {
      p_cap: 5,
      p_window_minutes: 60,
    });
    if (e1) {
      return jsonNoStore({ ok: false, error: `ensure_windows_failed: ${e1.message}` }, 500);
    }

    // 2) Detect if currently inside a window
    const nowIso = new Date().toISOString();

    const { data, error: e2 } = await supabaseAdmin
      .from("dd_tg_golden_windows")
      .select("day, slot, opens_at, closes_at, claimed_event_id")
      .lte("opens_at", nowIso)
      .gt("closes_at", nowIso)
      .order("opens_at", { ascending: true })
      .limit(1);

    if (e2) {
      return jsonNoStore({ ok: false, error: `active_window_query_failed: ${e2.message}` }, 500);
    }

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
