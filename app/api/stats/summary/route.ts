import { NextResponse } from "next/server";

function reqEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");

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
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: data?.message ?? text ?? `HTTP ${r.status}` },
      { status: 500 }
    );
  }

  // Return only safe aggregate fields we want for Scan.
  // We’ll pass through anything that exists; missing fields become 0.
  const findRate = Number(data?.find_rate ?? 0) || 0;
  const avgFuel = Number(data?.avg_fuel_per_attempt ?? 0) || 0;

  return NextResponse.json({
    ok: true,
    find_rate: findRate, // percent
    avg_fuel_per_attempt: avgFuel, // USDDD per attempt
  });
}
