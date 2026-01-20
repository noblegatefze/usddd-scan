import { NextResponse } from "next/server";

function reqEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");

type RpcOk = Record<string, unknown>;
type RpcErr = { message?: string };

function isRpcErr(v: unknown): v is RpcErr {
  return typeof v === "object" && v !== null && "message" in v;
}

export async function GET() {
  // Call the same RPC used by digdug-terminal: /rest/v1/rpc/stats_summary
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stats_summary`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}), // rpc expects POST; empty args
  });

  const text = await r.text();

  let parsed: unknown = null;
  try {
    parsed = text ? (JSON.parse(text) as RpcOk | RpcErr) : null;
  } catch {
    parsed = null;
  }

  if (!r.ok) {
    const msg =
      (isRpcErr(parsed) && typeof parsed.message === "string" && parsed.message) ||
      (typeof text === "string" && text) ||
      `HTTP ${r.status}`;

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const data = (parsed && typeof parsed === "object" ? (parsed as RpcOk) : {}) as RpcOk;

  // Return only safe aggregate fields we want for Scan.
  // We'll pass through anything that exists; missing fields become 0.
  const findRate = Number((data as Record<string, unknown>)["find_rate"] ?? 0) || 0;
  const avgFuel = Number((data as Record<string, unknown>)["avg_fuel_per_attempt"] ?? 0) || 0;

  return NextResponse.json({
    ok: true,
    find_rate: findRate, // percent
    avg_fuel_per_attempt: avgFuel, // USDDD per attempt
  });
}
