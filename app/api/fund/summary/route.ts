import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

const ACTIVE_STATUSES = new Set(["funded_locked", "swept_locked"]);

export async function GET(req: Request) {
  try {
    const supabaseUrl = env("SUPABASE_URL");
    const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const url = new URL(req.url);
    const terminalUserId = (url.searchParams.get("terminal_user_id") || "").trim() || null;

    // Pull statuses + amounts (we compute counts and sums consistently from one dataset)
    const { data: rows, error } = await sb
      .from("fund_positions")
      .select("status,funded_usdt,terminal_user_id", { head: false });

    if (error) throw error;

    const counts: Record<string, number> = {};
    let totalFundedUsdt = 0;
    let userFundedUsdt = 0;

    for (const r of rows ?? []) {
      const s = String((r as any).status ?? "unknown");
      counts[s] = (counts[s] ?? 0) + 1;

      if (ACTIVE_STATUSES.has(s)) {
        const v = Number((r as any).funded_usdt ?? 0);
        if (Number.isFinite(v)) {
          totalFundedUsdt += v;

          if (terminalUserId) {
            const tuid = String((r as any).terminal_user_id ?? "");
            if (tuid === terminalUserId) userFundedUsdt += v;
          }
        }
      }
    }

    const pending = (counts["awaiting_funds"] ?? 0) + (counts["issued"] ?? 0);

    const fundedLocked = counts["funded_locked"] ?? 0;
    const sweptLocked = counts["swept_locked"] ?? 0;
    const active = fundedLocked + sweptLocked;

    return NextResponse.json({
      ok: true,

      // Backward-compatible keys for current Fund UI
      pending_positions: pending,
      active_positions: active,
      total_funded_usdt: totalFundedUsdt,
      counts_by_status: counts,

      // Structured sections for later UI cleanup / operator panels
      global: {
        pending_positions: pending,
        active_positions: active,
        total_funded_usdt: totalFundedUsdt,
        counts_by_status: counts,
        active_statuses: Array.from(ACTIVE_STATUSES),
      },

      user: terminalUserId
        ? {
            terminal_user_id: terminalUserId,
            total_funded_usdt: userFundedUsdt,
            active_statuses: Array.from(ACTIVE_STATUSES),
          }
        : null,

      note:
        "Fund Network summary (Scan). Active positions = funded_locked + swept_locked. Add ?terminal_user_id=... for per-user totals.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "summary failed" }, { status: 400 });
  }
}
