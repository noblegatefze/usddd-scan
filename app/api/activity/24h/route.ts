import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Force runtime execution (never static during build)
export const dynamic = "force-dynamic";

// Allow Next to cache at runtime (does NOT run at build)
export const revalidate = 60;

function iso(d: Date) {
  return d.toISOString();
}

async function maybeRefreshRollup(supabase: any) {
  try {
    // Refresh occasionally to avoid request stampede
    if (Math.random() < 0.1) {
      await supabase.rpc("rpc_rollup_stats_events_1m", { last_minutes: 5 });
    }
  } catch {
    // Never block the response
  }
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

    const normalized = cap > 0 ? Math.max(0, Math.min(raw, cap)) / cap : 0;
    m.network_performance_display_pct = base + normalized * (100 - base);
  } catch {
    // never break endpoint
  }
}

function buildSafePayload(start: Date, end: Date, mode: string, warning: string, error?: string) {
  const payload: any = {
    ok: true,
    mode,
    error: error ?? null,
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

      // at floor => 0%
      network_performance_pct: 0,
      network_performance_cap_pct: 99.98,
    },
    warnings: [warning],
  };

  addNetworkPerformanceDisplay(payload);
  return payload;
}

export async function GET() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  // ------------------------------------------------------------
  // BUILD-TIME GUARD (CRITICAL)
  // Prevent Next/Vercel build from executing a slow Supabase RPC.
  // This is the exact issue that caused build timeouts.
  // ------------------------------------------------------------
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const payload = buildSafePayload(
      start,
      end,
      "build_guard",
      "BUILD GUARD: skipped Supabase during build (activity_24h)"
    );
    return NextResponse.json(payload, { status: 200 });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl) throw new Error("SUPABASE_URL is required.");
    if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    // Maintenance gate (DB-authoritative)
    const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
    if (flagsErr) throw flagsErr;
    const row: any = Array.isArray(flags) ? flags[0] : flags;

    const bypassPause = process.env.BYPASS_PAUSE === "1";

    if (row && row.pause_all && !bypassPause) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    }

    await maybeRefreshRollup(supabase);

    // FAST PATH: read from 1-minute rollup (avoids 24h aggregation over stats_events)
    const { data: roll, error: rollErr } = await supabase
      .from("stats_events_rollup_1m")
      .select("dig_success_count, usddd_spent, reward_usd, bucket_minute")
      .gte("bucket_minute", iso(start))
      .lt("bucket_minute", iso(end));

    if (rollErr) throw rollErr;

    const sums = (roll ?? []).reduce(
      (acc: any, r: any) => {
        acc.dig_success += Number(r.dig_success_count ?? 0);
        acc.usddd_spent += Number(r.usddd_spent ?? 0);
        acc.reward_usd += Number(r.reward_usd ?? 0);
        return acc;
      },
      { dig_success: 0, usddd_spent: 0, reward_usd: 0 }
    );

    // Keep payload shape stable for the UI
    const payload: any = {
      ok: true,
      mode: "rollup_1m",
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
        claims_value_usd: sums.reward_usd, // previously "claims_value_usd" used reward_value_usd in the old money RPC
        usddd_spent: sums.usddd_spent,
      },
      model: {
        reward_efficiency_usd_per_usddd:
          sums.usddd_spent > 0 ? sums.reward_usd / sums.usddd_spent : 0,
        reward_efficiency_prev_usd_per_usddd: 0,
        efficiency_delta_usd_per_usddd: 0,

        accrual_scaling_pct: 3,
        accrual_floor_pct: 10,
        accrual_cap_pct: 25,
        accrual_potential_pct: 0,
        applied_accrual_pct: 10,

        network_performance_pct: 0,
        network_performance_cap_pct: 99.98,
      },
      warnings: [
        "ROLLUP MODE: /api/activity/24h served from stats_events_rollup_1m to protect DB",
      ],
    };

    addNetworkPerformanceDisplay(payload);

    return NextResponse.json(payload, {
      headers: {
        // Protect DB + smooth spikes (CDN cache)
        "cache-control": "public, s-maxage=60, stale-while-revalidate=120",
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
    const fallback = buildSafePayload(
      start,
      end,
      "safe_fallback",
      "SAFE FALLBACK: activity_24h RPC failed",
      e?.message ?? "unknown"
    );

    return NextResponse.json(fallback, { status: 200 });
  }
}
