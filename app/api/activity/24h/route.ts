import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function buildSafePayload(start: Date, end: Date, mode: string, warning: string, error?: string) {
  const payload: any = {
    ok: true,
    mode,
    error: error ?? null,
    window: { start: start.toISOString(), end: end.toISOString(), hours: 24 },
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
    money: { claims_value_usd: 0, usddd_spent: 0 },
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

  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json(
      buildSafePayload(start, end, "build_guard", "BUILD GUARD: skipped Supabase during build (activity_24h)"),
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

    if (!supabaseUrl) throw new Error("SUPABASE_URL is required");
    if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    // Maintenance gate (fast)
    const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
    if (flagsErr) throw flagsErr;

    const row: any = Array.isArray(flags) ? flags[0] : flags;
    const bypassPause = process.env.BYPASS_PAUSE === "1";
    if (row?.pause_all && !bypassPause) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503, headers: { "cache-control": "no-store" } });
    }

    // =============================
    // MUST-SUCCEED: CANONICAL MONEY
    // =============================
    const { data: curMoney, error: curMoneyErr } = await supabase.rpc("rpc_scan_money_24h_canonical");
    if (curMoneyErr) throw curMoneyErr;

    const curRow: any = Array.isArray(curMoney) ? curMoney[0] : curMoney;

    const claimsExecuted = Number(curRow?.claims_executed_24h ?? 0);
    const usdddSpent = Number(curRow?.usddd_spent_24h ?? 0);
    const rewardUsd = Number(curRow?.claims_value_usd_24h ?? 0);
    const uniqueClaimers = Number(curRow?.unique_claimers_24h ?? 0);

    // MODEL (keep shape stable)
    const accrualScalingPct = 3;
    const accrualFloorPct = 10;
    const accrualCapPct = 25;
    const perfCap = 99.98;

    const rewardEfficiency = usdddSpent > 0 ? rewardUsd / usdddSpent : 0;

    // previous-window removed earlier; keep fields but set to 0 (stable API)
    const prevRewardEfficiency = 0;
    const efficiencyDelta = 0;
    const networkPerformancePct = 0;

    const accrualPotentialPct = rewardEfficiency * accrualScalingPct;
    const appliedAccrualPct = Math.max(accrualFloorPct, Math.min(accrualPotentialPct, accrualCapPct));

    // =============================
    // BEST-EFFORT COUNTS (NO THROW)
    // Use count:"planned" to avoid heavy COUNT(*)
    // If these fail, we still return canonical money (no more zeros)
    // =============================
    const warnings: string[] = [
      "CANONICAL: money+executed claims derived from spend_ledger ↔ claims dig_id match + as-of snapshots.",
    ];

    const tasks = await Promise.allSettled([
      supabase
        .from("dd_sessions")
        .select("session_id", { count: "planned", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),

      supabase
        .from("dd_box_ledger")
        .select("id", { count: "planned", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),

      supabase
        .from("dd_tg_golden_events")
        .select("id", { count: "planned", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),

      supabase
        .from("dd_terminal_users")
        .select("id", { count: "planned", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),
    ]);

    // Defaults (so payload is always valid)
    let sessions24h = 0;
    let ledger24h = 0;
    let goldenEvents24h = 0;
    let terminalUsers24h = 0;

    // Unpack results safely
    const getCount = (res: any, label: string) => {
      if (!res || res.status !== "fulfilled") {
        warnings.push(`BEST-EFFORT: ${label} count failed (timeout/overload).`);
        return null;
      }
      const v = res.value;
      if (v?.error) {
        warnings.push(`BEST-EFFORT: ${label} count error: ${String(v.error?.message ?? v.error)}`);
        return null;
      }
      return Number(v?.count ?? 0) || 0;
    };

    const cSessions = getCount(tasks[0], "sessions");
    const cLedger = getCount(tasks[1], "ledger");
    const cGolden = getCount(tasks[2], "golden_events");
    const cUsers = getCount(tasks[3], "terminal_users");

    if (cSessions != null) sessions24h = cSessions;
    if (cLedger != null) ledger24h = cLedger;
    if (cGolden != null) goldenEvents24h = cGolden;
    if (cUsers != null) terminalUsers24h = cUsers;

    const payload: any = {
      ok: true,
      mode: "canonical_money_rpc_best_effort_counts",
      window: { start: start.toISOString(), end: end.toISOString(), hours: 24 },
      counts: {
        sessions_24h: sessions24h,
        protocol_actions: ledger24h, // best effort
        claims_executed: claimsExecuted,
        claim_reserves: claimsExecuted,
        unique_claimers: uniqueClaimers,
        ledger_entries: ledger24h,
        golden_events: goldenEvents24h,
        terminal_users: terminalUsers24h,
      },
      money: {
        claims_value_usd: rewardUsd,
        usddd_spent: usdddSpent,
      },
      model: {
        reward_efficiency_usd_per_usddd: rewardEfficiency,
        reward_efficiency_prev_usd_per_usddd: prevRewardEfficiency,
        efficiency_delta_usd_per_usddd: efficiencyDelta,

        accrual_scaling_pct: accrualScalingPct,
        accrual_floor_pct: accrualFloorPct,
        accrual_cap_pct: accrualCapPct,
        accrual_potential_pct: accrualPotentialPct,
        applied_accrual_pct: appliedAccrualPct,

        network_performance_pct: networkPerformancePct,
        network_performance_cap_pct: perfCap,
      },
      warnings,
    };

    addNetworkPerformanceDisplay(payload);

    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (e: any) {
    console.error("activity/24h FAILED", e);

    return NextResponse.json(
      buildSafePayload(start, end, "safe_fallback", "SAFE FALLBACK: activity_24h failed", e?.message ?? "unknown"),
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }
}
