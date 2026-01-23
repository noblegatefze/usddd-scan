import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

export async function GET() {
  try {
    const supabaseUrl = env("SUPABASE_URL");
    const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    // counts by status
    const { data: rows, error } = await sb
      .from("fund_positions")
      .select("status", { count: "exact", head: false });

    if (error) throw error;

    const counts: Record<string, number> = {};
    for (const r of rows ?? []) {
      const s = String((r as any).status ?? "unknown");
      counts[s] = (counts[s] ?? 0) + 1;
    }

    const pending = counts["awaiting_funds"] ?? 0;

    // funded statuses (we'll expand later as we add more lifecycle states)
    const fundedLocked = counts["funded_locked"] ?? 0;
    const active = fundedLocked;

    // total funded USDT for funded_locked
    const { data: fundedRows, error: sumErr } = await sb
      .from("fund_positions")
      .select("funded_usdt, status");

    if (sumErr) throw sumErr;

    let totalFundedUsdt = 0;
    for (const r of fundedRows ?? []) {
      const s = String((r as any).status ?? "");
      if (s !== "funded_locked") continue;
      const v = Number((r as any).funded_usdt ?? 0);
      if (Number.isFinite(v)) totalFundedUsdt += v;
    }

    return NextResponse.json({
      ok: true,
      pending_positions: pending,
      active_positions: active,
      total_funded_usdt: totalFundedUsdt,
      counts_by_status: counts,
      note: "Fund Network summary (Scan). Active positions currently counted as funded_locked only.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "summary failed" }, { status: 400 });
  }
}
