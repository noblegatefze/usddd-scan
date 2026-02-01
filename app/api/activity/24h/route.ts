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
      claims_executed: 0, // == Finds (24h)
      claim_reserves: 0,
      unique_claimers: 0,
      ledger_entries: 0,
      golden_events: 0,
      terminal_users: 0,
    },
    money: {
      claims_value_usd: 0, // canonical USD value distributed
      usddd_spent: 0, // canonical spend
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

  // BUILD GUARD
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

    // Maintenance gate
    const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
    if (flagsErr) throw flagsErr;

    const row: any = Array.isArray(flags) ? flags[0] : flags;
    const bypassPause = process.env.BYPASS_PAUSE === "1";
    if (row?.pause_all && !bypassPause) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    }

    // ----------------------------
    // CANONICAL: spend/finds ledger (ONLY dig:* rows)
    // ----------------------------
    const { data: spendRows, error: spendErr } = await supabase
      .from("dd_usddd_spend_ledger")
      .select("usddd_amount, terminal_user_id, spend_key, created_at")
      .like("spend_key", "dig:%")
      .gte("created_at", iso(start))
      .lt("created_at", iso(end));

    if (spendErr) throw spendErr;

    const usdddSpent = (spendRows ?? []).reduce(
      (acc: number, r: any) => acc + Number(r?.usddd_amount ?? 0),
      0
    );

    const finds24h = (spendRows ?? []).length;

    // unique claimers = distinct terminal_user_id in canonical spend rows
    const uniq = new Set<string>();
    for (const r of spendRows ?? []) {
      const id = r?.terminal_user_id;
      if (id) uniq.add(String(id));
    }
    const uniqueClaimers = uniq.size;

    // ----------------------------
    // CANONICAL: Value Distributed (USD)
    // From dd_box_ledger claim_reserve + price snapshot at dig time
    // ----------------------------
    const { data: reserveRows, error: reserveErr } = await supabase
      .from("dd_box_ledger")
      .select("amount, meta, created_at")
      .eq("entry_type", "claim_reserve")
      .gte("created_at", iso(start))
      .lt("created_at", iso(end));

    if (reserveErr) throw reserveErr;

    const rewardUsd = (reserveRows ?? []).reduce((acc: number, r: any) => {
      const amount = Number(r?.amount ?? 0);
      const priceRaw = (r?.meta as any)?.price_usd_at_dig;
      const price = Number(priceRaw ?? 0);

      if (amount > 0 && price > 0) acc += amount * price;
      return acc;
    }, 0);

    // ----------------------------
    // MODEL: efficiency + accrual + previous window delta
    // ----------------------------
    const accrualScalingPct = 3;
    const accrualFloorPct = 10;
    const accrualCapPct = 25;
    const perfCap = 99.98;

    const rewardEfficiency = usdddSpent > 0 ? rewardUsd / usdddSpent : 0;

    // previous window: [start-24h, start)
    const prevStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const prevEnd = start;

    // prev canonical spend rows
    const { data: prevSpendRows, error: prevSpendErr } = await supabase
      .from("dd_usddd_spend_ledger")
      .select("usddd_amount")
      .like("spend_key", "dig:%")
      .gte("created_at", iso(prevStart))
      .lt("created_at", iso(prevEnd));

    if (prevSpendErr) throw prevSpendErr;

    const prevUsdddSpent = (prevSpendRows ?? []).reduce(
      (acc: number, r: any) => acc + Number(r?.usddd_amount ?? 0),
      0
    );

    // prev canonical reserves for USD distributed
    const { data: prevReserveRows, error: prevReserveErr } = await supabase
      .from("dd_box_ledger")
      .select("amount, meta")
      .eq("entry_type", "claim_reserve")
      .gte("created_at", iso(prevStart))
      .lt("created_at", iso(prevEnd));

    if (prevReserveErr) throw prevReserveErr;

    const prevRewardUsd = (prevReserveRows ?? []).reduce((acc: number, r: any) => {
      const amount = Number(r?.amount ?? 0);
      const priceRaw = (r?.meta as any)?.price_usd_at_dig;
      const price = Number(priceRaw ?? 0);

      if (amount > 0 && price > 0) acc += amount * price;
      return acc;
    }, 0);

    const prevRewardEfficiency =
      prevUsdddSpent > 0 ? prevRewardUsd / prevUsdddSpent : 0;

    const efficiencyDelta = rewardEfficiency - prevRewardEfficiency;

    // performance: current vs previous (0..cap)
    let networkPerformancePct = 0;
    if (prevRewardEfficiency > 0 && rewardEfficiency >= 0) {
      const ratio = (rewardEfficiency / prevRewardEfficiency) * 100;
      networkPerformancePct = Math.max(0, Math.min(ratio, perfCap));
    }

    // accrual potential = efficiency × scaling (%)
    const accrualPotentialPct = rewardEfficiency * accrualScalingPct;

    // applied accrual = clamp( potential, floor, cap )
    // (kept as a policy value; potential is observational)
    const appliedAccrualPct = Math.max(
      accrualFloorPct,
      Math.min(accrualPotentialPct, accrualCapPct)
    );

    // ----------------------------
    // LIGHT QUERIES (indexed)
    // ----------------------------
    const [sessionsRes, ledgerRes, goldenRes, usersRes] = await Promise.all([
      supabase
        .from("dd_sessions")
        .select("session_id", { count: "exact", head: true })
        .gte("created_at", iso(start))
        .lt("created_at", iso(end)),

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

    const payload: any = {
      ok: true,
      mode: "canonical_dig_ledger",
      window: {
        start: start.toISOString(),
        end: end.toISOString(),
        hours: 24,
      },
      counts: {
        sessions_24h: sessionsRes.count ?? 0,
        protocol_actions: ledgerRes.count ?? 0,
        claims_executed: finds24h, // == Finds (24h)
        claim_reserves: finds24h, // == reserve count (canonical)
        unique_claimers: uniqueClaimers, // distinct terminal_user_id
        ledger_entries: ledgerRes.count ?? 0,
        golden_events: goldenRes.count ?? 0,
        terminal_users: usersRes.count ?? 0,
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
      warnings: [
        "CANONICAL: finds+utilized from dd_usddd_spend_ledger where spend_key like 'dig:%'.",
        "CANONICAL: value distributed (USD) from dd_box_ledger claim_reserve × price_usd_at_dig.",
        "MODEL: accrual potential = efficiency × scaling; performance = current vs previous efficiency.",
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
