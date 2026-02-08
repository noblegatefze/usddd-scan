import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function reqEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");

const TABLE_BOXES = "dd_boxes";

type BoxRow = { id: string | number | null; meta?: any };

type CanonRow = {
  box_id: string | null;
  deposited_total: number | string | null;
  withdrawn_total: number | string | null;
  claimed_unwithdrawn: number | string | null;
  onchain_balance: number | string | null; // remaining/available
};

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25), 1), 100);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Maintenance gate (DB-authoritative)
  const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
  if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
  const frow: any = Array.isArray(flags) ? flags[0] : flags;
  if (frow && frow.pause_all) return NextResponse.json({ ok: false, paused: true }, { status: 503 });

  // 1) Boxes (ids + meta)
  const { data: boxes, error: bErr } = await supabase.from(TABLE_BOXES).select("id, meta").limit(limit);
  if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });

  const typedBoxes = (boxes ?? []) as BoxRow[];
  const ids = typedBoxes.map((b) => b.id).filter((v): v is string | number => v !== null && v !== undefined);

  const metaById: Record<string, any> = {};
  for (const b of typedBoxes) {
    if (b?.id == null) continue;
    metaById[String(b.id)] = (b as any).meta ?? {};
  }

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, rows: [] });
  }

  // 2) ✅ DB-canonical accounting via rpc_box_balances_from_ledger
  const { data: canonRows, error: canonErr } = await supabase.rpc("rpc_box_balances_from_ledger", {
    p_box_ids: ids.map(String),
  });

  if (canonErr) {
    return NextResponse.json({ ok: false, error: canonErr.message }, { status: 500 });
  }

  const canonMap: Record<string, CanonRow> = {};
  for (const r of (canonRows ?? []) as any[]) {
    canonMap[String(r.box_id)] = {
      box_id: r.box_id,
      deposited_total: r.deposited_total,
      withdrawn_total: r.withdrawn_total,
      claimed_unwithdrawn: r.claimed_unwithdrawn,
      onchain_balance: r.onchain_balance,
    };
  }

  const rows = ids.map((id) => {
    const a = canonMap[String(id)];
    const meta = metaById[String(id)] ?? {};
    const cmc_id = typeof meta?.cmc_id === "number" ? meta.cmc_id : null;

    const deposited = toNum(a?.deposited_total);
    const withdrawn = toNum(a?.withdrawn_total);
    const claimed = toNum(a?.claimed_unwithdrawn);
    const remaining = toNum(a?.onchain_balance); // already computed canonically

    return {
      box: String(id),
      cmc_id,
      deposited,
      claimed,
      withdrawn,
      remaining,
    };
  });

  return NextResponse.json(
    { ok: true, rows },
    {
      headers: {
        "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    }
  );
}
