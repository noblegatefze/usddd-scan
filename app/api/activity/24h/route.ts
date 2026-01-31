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

    if (row && row.pause_all) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    }

    // Heavy RPC (now safe because build-time guard prevents execution during deploy)
    const { data, error } = await supabase.rpc("scan_activity_24h_v2", {
      start_ts: iso(start),
      end_ts: iso(end),
    });

    if (error) throw error;

    // Clone so we can safely mutate and enforce stable window
    const payload: any = {
      ...(data ?? {}),
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        hours: 24,
      },
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
