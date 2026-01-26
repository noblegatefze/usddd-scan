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

    if (!session_id) throw new Error("Missing session_id");
    if (refs.length === 0) throw new Error("Missing refs");

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    // Maintenance gate (DB-authoritative)
    const { data: flags, error: flagsErr } = await sb.rpc("rpc_admin_flags");
    if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    const row: any = Array.isArray(flags) ? flags[0] : flags;
    if (row && (row.pause_all || row.pause_reserve)) {
      return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    }


    const { data: sess, error: sessErr } = await sb
      .from("dd_sessions")
      .select("user_id, username, source")
      .eq("session_id", session_id)
      .limit(1)
      .single();

    if (sessErr || !sess) throw new Error("Session not found");
    if (!sess.user_id) throw new Error("Session has no user_id");

    // bind only the provided refs
    const { data: upd, error: updErr } = await sb
      .from("fund_positions")
      .update({ terminal_user_id: sess.user_id })
      .in("position_ref", refs)
      .select("position_ref");

    if (updErr) throw updErr;

    return NextResponse.json({
      ok: true,
      bound_user_id: sess.user_id,
      bound_username: sess.username ?? null,
      bound_count: Array.isArray(upd) ? upd.length : 0,
      refs: Array.isArray(upd) ? upd.map((r: any) => r.position_ref) : [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "bind failed" }, { status: 400 });
  }
}
