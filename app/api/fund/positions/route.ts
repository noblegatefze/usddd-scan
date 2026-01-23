import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

export async function POST(req: Request) {
  try {
    const j = await req.json();
    const refs: string[] = Array.isArray(j?.refs) ? j.refs.filter(Boolean) : [];

    if (refs.length === 0) {
      return NextResponse.json({ ok: true, positions: [] });
    }

    const sb = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    const { data, error } = await sb
      .from("fund_positions")
      .select(`
        id,
        position_ref,
        issued_deposit_address,
        funded_usdt,
        funded_at,
        deposit_tx_hash,
        status,
        sweep_tx_hash,
        swept_at,
        gas_topup_tx_hash,
        gas_topup_bnb,
        gas_topup_at,
        usddd_allocated,
        usddd_accrued_display,
        created_at
      `)
      .in("position_ref", refs);

    if (error) throw error;

    return NextResponse.json({ ok: true, positions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "positions failed" },
      { status: 400 }
    );
  }
}
