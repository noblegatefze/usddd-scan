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
const TABLE_STATS = "stats_events";
const TS_COL = "created_at";

type WarningRow = { scope: string; message: string };
type ClaimsUserRow = { user_id: string | number | null };
type SumRow = { sum: number | null };

function readSum(rows: SumRow[] | null | undefined): number {
  const v = rows?.[0]?.sum ?? 0;
  return Number(v ?? 0);
}

export async function GET() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // 1) Total claims in last 24h
  const claimsReq = supabase
    .from(TABLE_CLAIMS)
    .select("id", { count: "exact", head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // 2) Unique claimers in last 24h (fetch user_id list and count distinct in code)
  const uniqueClaimersReq = supabase
    .from(TABLE_CLAIMS)
    .select("user_id")
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // 3) Total ledger entries in last 24h
  const ledgerTotalReq = supabase
    .from(TABLE_LEDGER)
    .select("id", { count: "exact", head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso);

  // 4) Claim reserves in last 24h
  const reservesReq = supabase
    .from(TABLE_LEDGER)
    .select("id", { count: "exact", head: true })
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso)
    .eq("entry_type", "claim_reserve");

  // 5) Money metrics from stats_events (last 24h)
  const claimsValueUsdReq = supabase
    .from(TABLE_STATS)
    .select("reward_value_usd.sum()")
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso)
    .eq("event", "dig_success");

  const usdddSpentReq = supabase
    .from(TABLE_STATS)
    .select("usddd_cost.sum()")
    .gte(TS_COL, startIso)
    .lt(TS_COL, endIso)
    .eq("event", "dig_success");

  const [claims, uniqueClaimers, ledgerTotal, reserves, claimsValueUsd, usdddSpent] =
    await Promise.all([
      claimsReq,
      uniqueClaimersReq,
      ledgerTotalReq,
      reservesReq,
      claimsValueUsdReq,
      usdddSpentReq,
    ]);

  const warnings: WarningRow[] = [];

  if (claims.error) warnings.push({ scope: "claims", message: claims.error.message });
  if (uniqueClaimers.error)
    warnings.push({ scope: "unique_claimers", message: uniqueClaimers.error.message });
  if (ledgerTotal.error)
    warnings.push({ scope: "ledger_total", message: ledgerTotal.error.message });
  if (reserves.error) warnings.push({ scope: "reserves", message: reserves.error.message });
  if (claimsValueUsd.error)
    warnings.push({ scope: "claims_value_usd", message: claimsValueUsd.error.message });
  if (usdddSpent.error) warnings.push({ scope: "usddd_spent", message: usdddSpent.error.message });

  const uniqueRows = (uniqueClaimers.data ?? []) as ClaimsUserRow[];
  const uniqueCount = new Set(uniqueRows.map((r) => String(r.user_id ?? ""))).size;

  const claimsValueRows = (claimsValueUsd.data ?? []) as SumRow[];
  const usdddSpentRows = (usdddSpent.data ?? []) as SumRow[];

  return NextResponse.json({
    window: { start: startIso, end: endIso, hours: 24 },
    counts: {
      claims: claims.count ?? 0,
      unique_claimers: uniqueCount,
      ledger_entries: ledgerTotal.count ?? 0,
      claim_reserves: reserves.count ?? 0,
    },
    money: {
      claims_value_usd: readSum(claimsValueRows),
      usddd_spent: readSum(usdddSpentRows),
    },
    warnings: warnings.length ? warnings : undefined,
    schema_assumption: { timestamp_column: TS_COL },
  });
}
