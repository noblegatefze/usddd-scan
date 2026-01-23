import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

export async function POST(req: Request) {
  try {
    const j = await req.json().catch(() => ({} as any));

    const session_id = typeof j?.session_id === "string" ? j.session_id.trim() : "";
    const refs: string[] = Array.isArray(j?.refs) ? j.refs.map((x: any) => String(x).trim()).filter(Boolean) : [];

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Mode A: session_id -> resolve terminal user -> return all bound positions
    if (session_id) {
      const { data: sess, error: sessErr } = await sb
        .from("dd_sessions")
        .select("user_id")
        .eq("session_id", session_id)
        .limit(1)
        .single();

      if (sessErr || !sess) throw new Error("Session not found");
      if (!sess.user_id) throw new Error("Session has no user_id");

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
          created_at,
          terminal_user_id
        `)
        .eq("terminal_user_id", sess.user_id);

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        mode: "terminal_user",
        positions: data ?? [],
      });
    }

    // Mode B: refs -> return those positions (existing behavior)
    if (refs.length === 0) {
      return NextResponse.json({ ok: true, mode: "refs", positions: [] });
    }

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
        created_at,
        terminal_user_id
      `)
      .in("position_ref", refs);

    if (error) throw error;

    return NextResponse.json({ ok: true, mode: "refs", positions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "positions failed" }, { status: 400 });
  }
}
