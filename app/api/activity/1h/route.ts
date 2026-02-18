import { NextRequest, NextResponse } from "next/server";
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ms(v: any): number {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

function toIso(v: any): string | null {
  const t = Date.parse(String(v ?? ""));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const wantRefresh = url.searchParams.get("refresh") === "1";

    const SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

    const SUPABASE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL) return json({ ok: false, error: "missing_supabase_url" }, 500);
    if (!SUPABASE_KEY) return json({ ok: false, error: "missing_service_role" }, 500);

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    const KEY = "activity_1h";
    const HOURS = 1;

    // 1) read snapshot
    let { data, error } = await sb
      .from("dd_activity_window_snapshot")
      .select("*")
      .eq("key", KEY)
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 500);
    if (!data) return json({ ok: true, mode: "empty_snapshot", row: null }, 200);

    // 2) refresh ONLY if explicitly requested AND stale
    const STALE_AFTER_MS = 60_000; // 60s throttle
    const asOfMs = ms((data as any).as_of);
    const ageMs = Number.isFinite(asOfMs) ? Date.now() - asOfMs : Infinity;

    let refreshed = false;

    if (wantRefresh && ageMs > STALE_AFTER_MS) {
      await sb.rpc("rpc_refresh_activity_window_snapshot", { p_key: KEY, p_hours: HOURS });

      const reread = await sb
        .from("dd_activity_window_snapshot")
        .select("*")
        .eq("key", KEY)
        .maybeSingle();

      if (!reread.error && reread.data) {
        data = reread.data;
        refreshed = true;
      }
    }

    // 3) current efficiency (from snapshot row)
    const effNow =
      typeof (data as any).reward_efficiency === "number"
        ? (data as any).reward_efficiency
        : Number((data as any).reward_efficiency ?? 0);

    // 4) prev efficiency (canonical money window: prev_start..prev_end)
    // Use the snapshot's window_start/window_end as truth anchors.
    const curStartIso = toIso((data as any).window_start);
    const curEndIso = toIso((data as any).window_end);

    let effPrev: number | null = null;

    if (curStartIso && curEndIso) {
      const curStartMs = Date.parse(curStartIso);
      const curEndMs = Date.parse(curEndIso);
      const durMs = Math.max(0, curEndMs - curStartMs);

      const prevStartIso = new Date(curStartMs - durMs).toISOString();
      const prevEndIso = new Date(curStartMs).toISOString();

      // rpc_scan_money_window_canonical_api returns a TABLE row with reward_efficiency_usd_per_usddd
      const prev = await sb.rpc("rpc_scan_money_window_canonical_api", {
        p_start: prevStartIso,
        p_end: prevEndIso,
      });

      if (!prev.error && Array.isArray(prev.data) && prev.data.length > 0) {
        const r0: any = prev.data[0];
        const v = Number(r0?.reward_efficiency_usd_per_usddd);
        if (Number.isFinite(v)) effPrev = v;
      }
    }

    const effDelta = (Number.isFinite(effNow) ? effNow : 0) - (Number.isFinite(effPrev as any) ? (effPrev as number) : 0);

    // 5) normalized model (include prev + delta)
    const floorPct = 10;
    const capPct = 25;

    const normalized = {
      window: {
        start: (data as any).window_start,
        end: (data as any).window_end,
        hours: HOURS,
      },
      money: {
        claims_value_usd: Number((data as any).claims_value_usd ?? 0),
        usddd_spent: Number((data as any).usddd_spent ?? 0),
      },
      model: {
        reward_efficiency_usd_per_usddd: Number.isFinite(effNow) ? effNow : 0,
        reward_efficiency_prev_usd_per_usddd: Number.isFinite(effPrev as any) ? (effPrev as number) : 0,
        efficiency_delta_usd_per_usddd: Number.isFinite(effDelta) ? effDelta : 0,

        // policy
        accrual_floor_pct: floorPct,
        accrual_cap_pct: capPct,
        applied_accrual_pct: clamp((Number.isFinite(effNow) ? effNow : 0) * 3, floorPct, capPct),
      },
    };

    // 6) backward compat + normalized + debug meta
    return json(
      {
        ok: true,
        mode: "snapshot_1h",
        row: data,
        ...normalized,
        meta: {
          refreshed,
          requested_refresh: wantRefresh,
          age_ms: Math.max(0, Math.trunc(ageMs)),
        },
      },
      200
    );
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
}
