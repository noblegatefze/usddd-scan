import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

export async function POST(req: NextRequest) {
  try {
    const j = await req.json().catch(() => ({} as any));

    const session_id = typeof j?.session_id === "string" ? j.session_id.trim() : "";
    const refs: string[] = Array.isArray(j?.refs) ? j.refs.map((x: any) => String(x).trim()).filter(Boolean) : [];

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Maintenance gate (DB-authoritative)
    const { data: flags, error: flagsErr } = await sb.rpc("rpc_admin_flags");
    if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    const row: any = Array.isArray(flags) ? flags[0] : flags;
    if (row && row.pause_all) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    }

    const SELECT_COLS = `
      id,
      position_ref,
      issued_deposit_address,
      funded_usdt,
      funded_at,
      deposit_tx_hash,
      status,
      locked,
      sweep_tx_hash,
      swept_at,
      gas_topup_tx_hash,
      gas_topup_bnb,
      gas_topup_at,
      usddd_allocated,
      usddd_accrued_display,
      created_at,
      terminal_user_id
    `;

    if (j?.authenticator === true) {
      const response = (body: object, status = 200) => NextResponse.json(body, {
        status, headers: { "Cache-Control": "no-store" },
      });
      const token = req.cookies.get("__Host-ussd-fund-session")?.value;
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return response({ error: "Sign in to view your positions." }, 401);
      const { data: session, error: sessionError } = await sb
        .from("fund_authenticator_sessions").select("terminal_user_id")
        .eq("token_hash", createHash("sha256").update(token).digest("hex"))
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (sessionError) return response({ error: "Fund sign-in is unavailable." }, 503);
      if (!session) return response({ error: "Your session has expired. Sign in again." }, 401);
      const { data: positions, error } = await sb.from("fund_positions")
        .select(SELECT_COLS).eq("terminal_user_id", session.terminal_user_id);
      if (error) return response({ error: "Your positions could not be loaded." }, 503);
      return response({ ok: true, positions: positions ?? [] });
    }

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
        .select(SELECT_COLS)
        .eq("terminal_user_id", sess.user_id);

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        mode: "terminal_user",
        positions: data ?? [],
      });
    }

    // Mode B: refs -> return those positions
    if (refs.length === 0) {
      return NextResponse.json({ ok: true, mode: "refs", positions: [] });
    }

    const { data, error } = await sb
      .from("fund_positions")
      .select(SELECT_COLS)
      .in("position_ref", refs);

    if (error) throw error;

    return NextResponse.json({ ok: true, mode: "refs", positions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "positions failed" }, { status: 400 });
  }
}
