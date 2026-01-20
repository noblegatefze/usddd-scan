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
const TS_COL = "created_at";

const RPC_MONEY_24H = "scan_activity_money_24h";

type WarningRow = { scope: string; message: string };
type ClaimsUserRow = { user_id: string | number | null };

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

  // 5) Money metrics via SQL RPC (aggregates not allowed via REST on this project)
  const moneyReq = supabase.rpc(RPC_MONEY_24H, {
    start_ts: startIso,
    end_ts: endIso,
  });

  const [claims, uniqueClaimers, ledgerTotal, reserves, money] = await Promise.all([
    claimsReq,
    uniqueClaimersReq,
    ledgerTotalReq,
    reservesReq,
    moneyReq,
  ]);

  const warnings: WarningRow[] = [];

  if (claims.error) warnings.push({ scope: "claims", message: claims.error.message });
  if (uniqueClaimers.error)
    warnings.push({ scope: "unique_claimers", message: uniqueClaimers.error.message });
  if (ledgerTotal.error)
    warnings.push({ scope: "ledger_total", message: ledgerTotal.error.message });
  if (reserves.error) warnings.push({ scope: "reserves", message: reserves.error.message });
  if (money.error) warnings.push({ scope: "money", message: money.error.message });

  const uniqueRows = (uniqueClaimers.data ?? []) as ClaimsUserRow[];
  const uniqueCount = new Set(uniqueRows.map((r) => String(r.user_id ?? ""))).size;

  const moneyObj =
    (money.data && typeof money.data === "object" ? (money.data as Record<string, unknown>) : null) ?? null;

  const claimsValueUsd = Number(moneyObj?.claims_value_usd ?? 0) || 0;
  const usdddSpent = Number(moneyObj?.usddd_spent ?? 0) || 0;

  return NextResponse.json({
    window: { start: startIso, end: endIso, hours: 24 },
    counts: {
      claims: claims.count ?? 0,
      unique_claimers: uniqueCount,
      ledger_entries: ledgerTotal.count ?? 0,
      claim_reserves: reserves.count ?? 0,
    },
    money: {
      claims_value_usd: claimsValueUsd,
      usddd_spent: usdddSpent,
    },
    warnings: warnings.length ? warnings : undefined,
    schema_assumption: { timestamp_column: TS_COL },
  });
}
