import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback != null) return fallback;
  throw new Error(`Missing env: ${name}`);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const j = await req.json().catch(() => ({} as any));
    const refsRaw = Array.isArray(j?.refs) ? j.refs : [];
    const refs = refsRaw.map((x: any) => String(x || "").trim()).filter(Boolean);

    if (!refs.length) return NextResponse.json({ ok: true, rows: [] });
    if (refs.length > 200) return NextResponse.json({ ok: false, error: "too_many_refs" }, { status: 400 });

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data, error } = await sb
      .from("fund_withdrawals")
      .select(
        "position_ref,status,requested_at,executing_at,minted_at,swept_at,executed_at,mint_tx_hash,sweep_tx_hash,last_error,amount_total_usddd,to_address"
      )
      .in("position_ref", refs)
      .order("requested_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // keep latest per position_ref
    const map = new Map<string, any>();
    for (const row of data ?? []) {
      const ref = String((row as any).position_ref || "");
      if (!ref) continue;
      if (!map.has(ref)) map.set(ref, row);
    }

    return NextResponse.json({
      ok: true,
      rows: Array.from(map.values()),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "batch failed" }, { status: 400 });
  }
}