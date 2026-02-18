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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET() {
  try {
    const SUPABASE_URL =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

    const SUPABASE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL)
      return json({ ok: false, error: "missing_supabase_url" }, 500);

    if (!SUPABASE_KEY)
      return json({ ok: false, error: "missing_service_role" }, 500);

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await sb
      .from("dd_activity_window_snapshot")
      .select("*")
      .eq("key", "activity_24h")
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message }, 500);
    if (!data) return json({ ok: false, error: "no_snapshot" }, 404);

    // -----------------------------
    // Normalize into expected shape
    // -----------------------------

    const rewardEff =
      typeof data.reward_efficiency === "number"
        ? data.reward_efficiency
        : Number(data.reward_efficiency ?? 0);

    const floorPct = 10;
    const capPct = 25;

    const appliedAccrualPct = clamp(rewardEff * 3, floorPct, capPct);

    return json(
      {
        window: {
          start: data.window_start,
          end: data.window_end,
          hours: 24,
        },

        money: {
          claims_value_usd: Number(data.claims_value_usd ?? 0),
          usddd_spent: Number(data.usddd_spent ?? 0),
        },

        model: {
          reward_efficiency_usd_per_usddd: rewardEff,
          accrual_floor_pct: floorPct,
          accrual_cap_pct: capPct,
          applied_accrual_pct: appliedAccrualPct,
        },
      },
      200
    );
  } catch (e: any) {
    return json(
      { ok: false, error: String(e?.message ?? e) },
      500
    );
  }
}
