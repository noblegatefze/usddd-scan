import { NextResponse } from "next/server";

export async function GET() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  return NextResponse.json({
    ok: true,
    mode: "safe_stub",
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
    warnings: ["SAFE MODE: activity/24h temporarily disabled to protect DB"],
  });
}
