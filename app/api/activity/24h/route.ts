import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function reqEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");

const TABLE_CLAIMS = "dd_treasure_claims";
const TABLE_LEDGER = "dd_box_ledger";
const TABLE_GOLDEN_EVENTS = "dd_tg_golden_events";
const TABLE_TERMINAL_USERS = "dd_terminal_users";
const TABLE_SESSIONS = "dd_sessions";

const TS_COL = "created_at";

const RPC_MONEY_24H = "scan_activity_money_24h";

// 🔒 Locked protocol economics (Network Funding accrual modeling)
const ACCRUAL_SCALING_PCT = 3; // Reward Efficiency × 3%
const ACCRUAL_FLOOR_PCT = 10;
const ACCRUAL_CAP_PCT = 25;
const NET_PERF_CAP_PCT = 99.98;

type WarningRow = { scope: string; message: string };
type ClaimsUserRow = { user_id: string | number | null };

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function toObj(x: unknown): Record<string, unknown> | null {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : null;
}

export async function GET() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(prevEnd.getTime() - 24 * 60 * 60 * 1000);

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const prevStartIso = prevStart.toISOString();
  const prevEndIso = prevEnd.toISOString();

  // Claims executed (24h)
  const claimsReq = supabase
    .from(TABLE_CLAIMS)
    .select("id", { count: "exact", head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // Unique claimers (optional)
  const uniqueClaimersReq = supabase
    .from(TABLE_CLAIMS)
    .select("user_id")
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // Ledger entries (24h)
  const ledgerTotalReq = supabase
    .from(TABLE_LEDGER)
    .select("id", { count: "exact", head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // Claim reserves (24h)
  const reservesReq = supabase
    .from(TABLE_LEDGER)
    .select("id", { count: "exact", head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso)
    .eq("entry_type", "claim_reserve");

  // Golden events (24h)
  const goldenEventsReq = supabase
    .from(TABLE_GOLDEN_EVENTS)
    .select("id", { count: "exact", head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // New terminal users (24h)
  const terminalUsersReq = supabase
    .from(TABLE_TERMINAL_USERS)
    .select("id", { count: "exact", head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // Sessions (24h) from dd_sessions
  const sessionsReq = supabase
    .from(TABLE_SESSIONS)
    .select("session_id", { head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // Money metrics (current + previous)
  const moneyReqNow = supabase.rpc(RPC_MONEY_24H, { start_ts: startIso, end_ts: endIso });
  const moneyReqPrev = supabase.rpc(RPC_MONEY_24H, { start_ts: prevStartIso, end_ts: prevEndIso });

  const [
    claims,
    uniqueClaimers,
    ledgerTotal,
    reserves,
    goldenEvents,
    terminalUsers,
    sessions,
    moneyNow,
    moneyPrev,
  ] = await Promise.all([
    claimsReq,
    uniqueClaimersReq,
    ledgerTotalReq,
    reservesReq,
    goldenEventsReq,
    terminalUsersReq,
    sessionsReq,
    moneyReqNow,
    moneyReqPrev,
  ]);

  const warnings: WarningRow[] = [];

  if (claims.error) warnings.push({ scope: "claims", message: claims.error.message });
  if (uniqueClaimers.error) warnings.push({ scope: "unique_claimers", message: uniqueClaimers.error.message });
  if (ledgerTotal.error) warnings.push({ scope: "ledger_total", message: ledgerTotal.error.message });
  if (reserves.error) warnings.push({ scope: "claim_reserves", message: reserves.error.message });
  if (goldenEvents.error) warnings.push({ scope: "golden_events", message: goldenEvents.error.message });
  if (terminalUsers.error) warnings.push({ scope: "terminal_users", message: terminalUsers.error.message });
  if (sessions.error) warnings.push({ scope: "sessions_24h", message: sessions.error.message });
  if (moneyNow.error) warnings.push({ scope: "money_now", message: moneyNow.error.message });
  if (moneyPrev.error) warnings.push({ scope: "money_prev", message: moneyPrev.error.message });

  const uniqueRows = (uniqueClaimers.data ?? []) as ClaimsUserRow[];
  const uniqueClaimersCount = new Set(uniqueRows.map((r) => String(r.user_id ?? ""))).size;

  const nowObj = toObj(moneyNow.data);
  const prevObj = toObj(moneyPrev.data);

  const claimsValueUsdNow = Number(nowObj?.claims_value_usd ?? 0) || 0;
  const usdddSpentNow = Number(nowObj?.usddd_spent ?? 0) || 0;

  const claimsValueUsdPrev = Number(prevObj?.claims_value_usd ?? 0) || 0;
  const usdddSpentPrev = Number(prevObj?.usddd_spent ?? 0) || 0;

  const rewardEffNow = usdddSpentNow > 0 ? claimsValueUsdNow / usdddSpentNow : 0;
  const rewardEffPrev = usdddSpentPrev > 0 ? claimsValueUsdPrev / usdddSpentPrev : 0;
  const efficiencyDelta = rewardEffNow - rewardEffPrev;

  // Accrual modeling
  const accrualPotentialPct = rewardEffNow * ACCRUAL_SCALING_PCT;
  const appliedAccrualPct = clamp(accrualPotentialPct, ACCRUAL_FLOOR_PCT, ACCRUAL_CAP_PCT);

  // Network performance (never hits 100.00)
  const rawPerf = (accrualPotentialPct / ACCRUAL_CAP_PCT) * 100;
  const networkPerformancePct = Math.min(NET_PERF_CAP_PCT, Math.max(0, rawPerf));

  const sessions24h = 0; // temp: remove exact count to prevent DB timeouts

  // Protocol actions (composite)
  const protocolActions =
    (claims.count ?? 0) +
    (ledgerTotal.count ?? 0) +
    (goldenEvents.count ?? 0) +
    (terminalUsers.count ?? 0) +
    sessions24h;

  return NextResponse.json({
    window: { start: startIso, end: endIso, hours: 24 },
    counts: {
      sessions_24h: sessions24h,
      protocol_actions: protocolActions,
      claims_executed: claims.count ?? 0,
      claim_reserves: reserves.count ?? 0,
      unique_claimers: uniqueClaimersCount,
      ledger_entries: ledgerTotal.count ?? 0,
      golden_events: goldenEvents.count ?? 0,
      terminal_users: terminalUsers.count ?? 0,
    },
    money: {
      claims_value_usd: claimsValueUsdNow,
      usddd_spent: usdddSpentNow,
    },
    model: {
      reward_efficiency_usd_per_usddd: rewardEffNow,
      reward_efficiency_prev_usd_per_usddd: rewardEffPrev,
      efficiency_delta_usd_per_usddd: efficiencyDelta,

      accrual_scaling_pct: ACCRUAL_SCALING_PCT,
      accrual_floor_pct: ACCRUAL_FLOOR_PCT,
      accrual_cap_pct: ACCRUAL_CAP_PCT,
      accrual_potential_pct: accrualPotentialPct,
      applied_accrual_pct: appliedAccrualPct,

      network_performance_pct: networkPerformancePct,
      network_performance_cap_pct: NET_PERF_CAP_PCT,
    },
    warnings: warnings.length ? warnings : undefined,
    schema_assumption: {
      timestamp_column: TS_COL,
      sessions_source: "dd_sessions.created_at",
    },
  });
}
