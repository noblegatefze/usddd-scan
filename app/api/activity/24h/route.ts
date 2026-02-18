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

    // 1) read current snapshot
    let { data, error } = await sb
      .from("dd_activity_window_snapshot")
      .select("*")
      .eq("key", "activity_24h")
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 500);
    if (!data) return json({ ok: false, error: "no_snapshot" }, 404);

    // 2) refresh ONLY if explicitly requested AND stale
    const STALE_AFTER_MS = 60_000; // 60s throttle
    const asOfMs = ms((data as any).as_of);
    const ageMs = Number.isFinite(asOfMs) ? Date.now() - asOfMs : Infinity;

    let refreshed = false;

    if (wantRefresh && ageMs > STALE_AFTER_MS) {
      await sb.rpc("rpc_refresh_activity_window_snapshot", {
        p_key: "activity_24h",
        p_hours: 24,
      });

      const reread = await sb
        .from("dd_activity_window_snapshot")
        .select("*")
        .eq("key", "activity_24h")
        .maybeSingle();

      if (!reread.error && reread.data) {
        data = reread.data;
        refreshed = true;
      }
    }

    // 3) normalized + backward compat
    const rewardEff =
      typeof (data as any).reward_efficiency === "number"
        ? (data as any).reward_efficiency
        : Number((data as any).reward_efficiency ?? 0);

    const floorPct = 10;
    const capPct = 25;
    const appliedAccrualPct = clamp(rewardEff * 3, floorPct, capPct);

    const normalized = {
      window: {
        start: (data as any).window_start,
        end: (data as any).window_end,
        hours: 24,
      },
      money: {
        claims_value_usd: Number((data as any).claims_value_usd ?? 0),
        usddd_spent: Number((data as any).usddd_spent ?? 0),
      },
      model: {
        reward_efficiency_usd_per_usddd: rewardEff,
        accrual_floor_pct: floorPct,
        accrual_cap_pct: capPct,
        applied_accrual_pct: appliedAccrualPct,
      },
    };

    return json(
      {
        ok: true,
        mode: "snapshot_24h",
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
