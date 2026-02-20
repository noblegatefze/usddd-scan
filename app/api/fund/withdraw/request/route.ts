import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback != null) return fallback;
  throw new Error(`Missing env: ${name}`);
}

function isLikelyEvmAddress(s: string) {
  const v = (s || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(v)) return false;
  if (v.toLowerCase() === "0x0000000000000000000000000000000000000000") return false;
  return true;
}

function jsonNoStore(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

export async function POST(req: Request) {
  try {
    const j = await req.json().catch(() => ({} as any));

    const session_id = typeof j?.session_id === "string" ? j.session_id.trim() : "";
    const position_ref = typeof j?.position_ref === "string" ? j.position_ref.trim() : "";
    const to_address = typeof j?.to_address === "string" ? j.to_address.trim() : "";

    if (!session_id) return jsonNoStore({ ok: false, error: "missing_session_id" }, 400);
    if (!position_ref) return jsonNoStore({ ok: false, error: "missing_position_ref" }, 400);
    if (!to_address) return jsonNoStore({ ok: false, error: "missing_to_address" }, 400);
    if (!isLikelyEvmAddress(to_address)) return jsonNoStore({ ok: false, error: "invalid_to_address" }, 400);

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Maintenance gate (DB-authoritative) — same pattern as your sweep route
    const { data: flags, error: flagsErr } = await sb.rpc("rpc_admin_flags");
    if (flagsErr) return jsonNoStore({ ok: false, paused: true }, 503);
    const row: any = Array.isArray(flags) ? flags[0] : flags;
    if (row && (row.pause_all || row.pause_reserve)) {
      return jsonNoStore({ ok: false, paused: true }, 503);
    }

    // OTP-like freshness: require a recently created terminal session
    // This assumes "refresh to get Session ID" creates a new dd_sessions row.
    const SESSION_MAX_AGE_MIN = 10;

    const { data: sess, error: sErr } = await sb
      .from("dd_sessions")
      .select("session_id, created_at, user_id, source")
      .eq("session_id", session_id)
      .eq("source", "terminal")
      .limit(1)
      .single();

    if (sErr || !sess?.user_id) return jsonNoStore({ ok: false, error: "session_not_found" }, 401);

    const createdMs = Date.parse(String(sess.created_at || ""));
    if (!Number.isFinite(createdMs)) return jsonNoStore({ ok: false, error: "session_invalid" }, 401);

    const ageMin = (Date.now() - createdMs) / 60000;
    if (ageMin > SESSION_MAX_AGE_MIN) {
      return jsonNoStore(
        {
          ok: false,
          error: "session_not_fresh",
          hint: "Open Terminal, refresh, copy the new session_id, and try again.",
        },
        401
      );
    }

    const terminal_user_id = String(sess.user_id);

    // Load position + ownership
    const { data: pos, error: pErr } = await sb
      .from("fund_positions")
      .select("id, position_ref, terminal_user_id, status, locked")
      .eq("position_ref", position_ref)
      .limit(1)
      .single();

    if (pErr || !pos?.id) return jsonNoStore({ ok: false, error: "position_not_found" }, 404);

    if (!pos.terminal_user_id || String(pos.terminal_user_id) !== terminal_user_id) {
      return jsonNoStore({ ok: false, error: "position_not_owned" }, 403);
    }

    // Withdraw allowed gate:
    // v0.3.4.0 rule: only when admin unlocked AND still in accruing custody stage
    if (Boolean(pos.locked) !== false) return jsonNoStore({ ok: false, error: "withdraw_locked" }, 403);
    if (String(pos.status) !== "swept_locked") return jsonNoStore({ ok: false, error: "withdraw_not_allowed_status" }, 403);

    // Insert withdrawal request (idempotent: unique(position_id))
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;

    const ua = req.headers.get("user-agent") || null;
    const session_hint = session_id.length >= 6 ? session_id.slice(-6) : session_id;

    const { data: ins, error: iErr } = await sb
      .from("fund_withdrawals")
      .insert({
        position_id: pos.id,
        position_ref: pos.position_ref,
        terminal_user_id,
        to_address,
        status: "requested",
        session_hint,
        request_ip: ip,
        request_user_agent: ua,

        // amounts are frozen at EXECUTION step (not request)
        amount_allocated_usddd: 0,
        amount_accrued_usddd: 0,
        amount_total_usddd: 0,
      })
      .select("id, status, requested_at, position_ref, to_address")
      .limit(1)
      .single();

    if (iErr) {
      // Unique constraint hit => return existing (idempotent)
      const msg = String(iErr.message || "").toLowerCase();
      const dup =
        msg.includes("fund_withdrawals_one_per_position") ||
        msg.includes("duplicate") ||
        msg.includes("unique");

      if (dup) {
        const { data: existing } = await sb
          .from("fund_withdrawals")
          .select("id, status, requested_at, position_ref, to_address")
          .eq("position_id", pos.id)
          .limit(1)
          .single();

        return jsonNoStore({ ok: true, mode: "already_requested", withdrawal: existing ?? null });
      }

      return jsonNoStore({ ok: false, error: "withdraw_request_insert_failed" }, 500);
    }

    return jsonNoStore({ ok: true, mode: "requested", withdrawal: ins });
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message ?? "withdraw request failed" }, 400);
  }
}
