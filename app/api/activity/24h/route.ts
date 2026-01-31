import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const revalidate = 60; // cache this route for 60s at the edge/server
export const dynamic = "force-dynamic";

function iso(d: Date) {
  return d.toISOString();
}

function addNetworkPerformanceDisplay(data: any) {
  // Add display-friendly network performance (0..cap -> 55.6..100)
  // This is NOT a clamp. It's a UI scale so "floor" doesn't look dead.
  try {
    const m = data?.model;
    if (!m || typeof m.network_performance_pct !== "number") return;

    const cap = Number(m.network_performance_cap_pct ?? 99.98) || 99.98;
    const base = 55.6; // baseline display (non-round on purpose)
    const raw = Number(m.network_performance_pct ?? 0) || 0;

    // normalize into 0..1 based on cap
    const normalized =
      cap > 0 ? Math.max(0, Math.min(raw, cap)) / cap : 0;

    m.network_performance_display_pct = base + normalized * (100 - base);
  } catch {
    // swallow (never break endpoint)
  }
}

export async function GET() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  try {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl) throw new Error("SUPABASE_URL is required.");
    if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    // Maintenance gate (DB-authoritative)
    const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
    if (flagsErr) throw flagsErr;
    const row: any = Array.isArray(flags) ? flags[0] : flags;
    if (row && row.pause_all) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    }

    const { data, error } = await supabase.rpc("scan_activity_24h_v2", {
      start_ts: iso(start),
      end_ts: iso(end),
    });

    if (error) throw error;

    // Clone so we can safely mutate (and ensure window override is stable)
    const payload: any = {
      ...(data ?? {}),
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        hours: 24,
      },
    };

    // Ensure display metric exists even for rpc_v2 responses
    addNetworkPerformanceDisplay(payload);

    return NextResponse.json(payload, {
      headers: {
        // short cache to protect DB + smooth spikes
        "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (e: any) {
    console.error("activity/24h RPC FAILED", {
      message: e?.message,
      name: e?.name,
      details: e?.details,
      hint: e?.hint,
      code: e?.code,
      cause: e?.cause,
      stack: e?.stack,
    });

    // HARD SAFE FALLBACK (never break Scan again)
    const fallback: any = {
      ok: true,
      mode: "safe_fallback",
      error: e?.message ?? "unknown",
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        hours: 24,
      },
      counts: {
        sessions_24h: 0,
        protocol_actions: 0,
        claims_executed: 0,
        claim_reserves: 0,
        unique_claimers: 0,
        ledger_entries: 0,
        golden_events: 0,
        terminal_users: 0,
      },
      money: {
        claims_value_usd: 0,
        usddd_spent: 0,
      },
      model: {
        reward_efficiency_usd_per_usddd: 0,
        reward_efficiency_prev_usd_per_usddd: 0,
        efficiency_delta_usd_per_usddd: 0,

        accrual_scaling_pct: 3,
        accrual_floor_pct: 10,
        accrual_cap_pct: 25,
        accrual_potential_pct: 0,
        applied_accrual_pct: 10,

        // at floor => 0% by definition (kept explicit so it's not "mysterious zero")
        network_performance_pct: ((10 - 10) / (25 - 10)) * 100,
        network_performance_cap_pct: 99.98,
      },
      warnings: ["SAFE FALLBACK: activity_24h RPC failed"],
    };

    // Add display metric for fallback too
    addNetworkPerformanceDisplay(fallback);

    return NextResponse.json(fallback, { status: 200 });
  }
}
