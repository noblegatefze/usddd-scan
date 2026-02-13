import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(req: Request) {
  try {
    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Maintenance gate (DB-authoritative)
    const { data: flags, error: flagsErr } = await sb.rpc("rpc_admin_flags");
    if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
    const row: any = Array.isArray(flags) ? flags[0] : flags;
    if (row && row.pause_all) return NextResponse.json({ ok: false, paused: true }, { status: 503 });

    const url = new URL(req.url);
    const rawTuid = (url.searchParams.get("terminal_user_id") || "").trim();
    const terminalUserId = rawTuid && isUuid(rawTuid) ? rawTuid : null;

    const { data, error } = await sb.rpc("rpc_fund_summary_v1", {
      p_terminal_user_id: terminalUserId,
    });

    if (error) throw error;

    const r: any = Array.isArray(data) ? data[0] : data;
    const pending = Number(r?.pending_positions ?? 0);
    const active = Number(r?.active_positions ?? 0);

    const totalFundedUsdt = Number(r?.total_funded_usdt ?? 0);
    const totalAllocatedUsddd = Number(r?.total_allocated_usddd ?? 0);
    const totalAccruedUsddd = Number(r?.total_accrued_usddd ?? 0);

    const user = terminalUserId
      ? {
          terminal_user_id: terminalUserId,
          positions: Number(r?.user_positions ?? 0),
          total_funded_usdt: Number(r?.user_funded_usdt ?? 0),
          total_allocated_usddd: Number(r?.user_allocated_usddd ?? 0),
          total_accrued_usddd: Number(r?.user_accrued_usddd ?? 0),
        }
      : null;

    return NextResponse.json({
      ok: true,

      // Backward-compatible keys for current Fund UI
      pending_positions: pending,
      active_positions: active,
      total_funded_usdt: totalFundedUsdt,

      // New truth keys (safe to add)
      total_allocated_usddd: totalAllocatedUsddd,
      total_accrued_usddd: totalAccruedUsddd,
      total_with_accrual_usddd: totalAllocatedUsddd + totalAccruedUsddd,

      global: {
        pending_positions: pending,
        active_positions: active,
        total_funded_usdt: totalFundedUsdt,
        total_allocated_usddd: totalAllocatedUsddd,
        total_accrued_usddd: totalAccruedUsddd,
        total_with_accrual_usddd: totalAllocatedUsddd + totalAccruedUsddd,
      },

      user,

      note:
        "Fund Network summary (Scan). Active = funded_locked + swept_locked. Accrued is stored truth (usddd_accrued_display). Add ?terminal_user_id=<uuid> for per-user totals.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "summary failed" }, { status: 400 });
  }
}
