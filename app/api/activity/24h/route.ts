import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

function iso(d: Date) {
  return d.toISOString();
}

function addNetworkPerformanceDisplay(data: any) {
  try {
    const m = data?.model;
    if (!m || typeof m.network_performance_pct !== "number") return;

    const cap = Number(m.network_performance_cap_pct ?? 99.98) || 99.98;
    const base = 55.6;
    const raw = Number(m.network_performance_pct ?? 0) || 0;

    const normalized = cap > 0 ? Math.max(0, Math.min(raw, cap)) / cap : 0;
    m.network_performance_display_pct = base + normalized * (100 - base);
  } catch {
    // never break endpoint
  }
}

function buildSafePayload(
  start: Date,
  end: Date,
  mode: string,
  warning: string,
  error?: string
) {
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
  // BUILD GUARD (prevents Supabase calls during Vercel build)
  // ------------------------------------------------------------
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json(
      buildSafePayload(
        start,
        end,
        "build_guard",
        "BUILD GUARD: skipped Supabase during build (activity_24h)"
      ),
      { status: 200 }
    );
  }

  try {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl) throw new Error("SUPABASE_URL is required");
    if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    // ------------------------------------------------------------
    // Maintenance gate (DB-authoritative)
    // ------------------------------------------------------------
    const { data: flags, error: flagsErr } = await supabase.rpc(
      "rpc_admin_flags"
    );
    if (flagsErr) throw flagsErr;

    const row: any = Array.isArray(flags) ? flags[0] : flags;
    const bypassPause = process.env.BYPASS_PAUSE === "1";

    if (row?.pause_all && !bypassPause) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    }

    // ------------------------------------------------------------
    // CANONICAL MONEY:
    // USDDD Utilized must come from dd_usddd_spend_ledger (truth)
    // ------------------------------------------------------------
    const [spendSumRes, spendCountRes] = await Promise.all([
      supabase
        .from("dd_usddd_spend_ledger")
        .select("usddd_amount", { head: false })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),

      supabase
        .from("dd_usddd_spend_ledger")
        .select("id", { count: "exact", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),
    ]);

    if (spendSumRes.error) throw spendSumRes.error;
    if (spendCountRes.error) throw spendCountRes.error;

    const usdddSpent = (spendSumRes.data ?? []).reduce(
      (acc: number, r: any) => acc + Number(r?.usddd_amount ?? 0),
      0
    );

    // ------------------------------------------------------------
    // Value Distributed (USD)
    // TEMP: keep from stats rollup (telemetry), until rewards ledger exists
    // ------------------------------------------------------------
    const { data: roll, error: rollErr } = await supabase
      .from("stats_events_rollup_1m")
      .select("reward_usd, bucket_minute")
      .gte("bucket_minute", iso(start))
      .lt("bucket_minute", iso(end));

    if (rollErr) throw rollErr;

    const rewardUsd = (roll ?? []).reduce(
      (acc: number, r: any) => acc + Number(r?.reward_usd ?? 0),
      0
    );

    // ------------------------------------------------------------
    // LIGHT QUERIES (indexed)
    // ------------------------------------------------------------
    const [
      sessionsRes,
      executedClaimsRes,
      executedClaimersRes,
      ledgerRes,
      goldenRes,
      usersRes,
    ] = await Promise.all([
      supabase
        .from("dd_sessions")
        .select("session_id", { count: "exact", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),

      // Claims Executed = withdrawn_at in window
      supabase
        .from("dd_treasure_claims")
        .select("id", { count: "exact", head: true })
        .gte("withdrawn_at", iso(start))
        .lt("withdrawn_at", iso(end)),

      // Unique claimers based on executed claims
      supabase
        .from("dd_treasure_claims")
        .select("user_id", { count: "exact", head: true })
        .gte("withdrawn_at", iso(start))
        .lt("withdrawn_at", iso(end)),

      // Protocol actions proxy = ledger entries (still fine)
      supabase
        .from("dd_box_ledger")
        .select("id", { count: "exact", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),

      supabase
        .from("dd_tg_golden_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),

      supabase
        .from("dd_terminal_users")
        .select("id", { count: "exact", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),
    ]);

    // Note: Supabase count on "user_id" is row count, not distinct.
    // We'll keep it as-is to avoid heavy distinct queries.
    // If you want true distinct, we’ll add an RPC later.

    const payload: any = {
      ok: true,
      mode: "canonical_ledger_plus_dd",
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        hours: 24,
      },
      counts: {
        sessions_24h: sessionsRes.count ?? 0,
        protocol_actions: ledgerRes.count ?? 0,
        claims_executed: executedClaimsRes.count ?? 0,
        claim_reserves: spendCountRes.count ?? 0, // number of spend rows as a proxy reserve count
        unique_claimers: executedClaimersRes.count ?? 0,
        ledger_entries: ledgerRes.count ?? 0,
        golden_events: goldenRes.count ?? 0,
        terminal_users: usersRes.count ?? 0,
      },
      money: {
        claims_value_usd: rewardUsd,
        usddd_spent: usdddSpent,
      },
      model: {
        reward_efficiency_usd_per_usddd:
          usdddSpent > 0 ? rewardUsd / usdddSpent : 0,

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
        "CANONICAL MODE: USDDD utilized from dd_usddd_spend_ledger (truth).",
        "NOTE: Value Distributed (USD) still sourced from rollup until rewards ledger is added.",
      ],
    };

    addNetworkPerformanceDisplay(payload);

    return NextResponse.json(payload, {
      headers: {
        "cache-control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (e: any) {
    console.error("activity/24h FAILED", e);

    return NextResponse.json(
      buildSafePayload(
        start,
        end,
        "safe_fallback",
        "SAFE FALLBACK: activity_24h failed",
        e?.message ?? "unknown"
      ),
      { status: 200 }
    );
  }
}
