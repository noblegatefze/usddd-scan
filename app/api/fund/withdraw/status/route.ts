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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ref = (url.searchParams.get("ref") ?? "").trim();
    if (!ref) return NextResponse.json({ ok: false, error: "missing_ref" }, { status: 400 });

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data, error } = await sb
      .from("fund_withdrawals")
      .select(`
        id,
        position_ref,
        to_address,
        status,
        requested_at,
        executing_at,
        minted_at,
        swept_at,
        executed_at,
        amount_allocated_usddd,
        amount_accrued_usddd,
        amount_total_usddd,
        mint_tx_hash,
        sweep_tx_hash,
        last_error
      `)
      .eq("position_ref", ref)
      .order("requested_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    // NEW: also fetch position truth (allocated/accrued) so pending receipts aren't blank
    const { data: pos, error: posErr } = await sb
      .from("fund_positions")
      .select("position_ref,status,locked,usddd_allocated,usddd_accrued_display")
      .eq("position_ref", ref)
      .limit(1)
      .single();

    return NextResponse.json({
      ok: true,
      withdrawal: data,
      position: posErr ? null : pos ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "status failed" }, { status: 400 });
  }
}
