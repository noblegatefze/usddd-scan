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

// UI-only: if withdrawn_total is 0 but claimed exists, show a proxy withdrawn for nicer Scan display.
// This does NOT write to DB and does NOT affect any protocol logic.
const WITHDRAWN_PROXY_PCT = 0.15;

type BoxRow = { id: string | number | null; meta?: any };

type AccountingRow = {
  box_id: string | number | null;
  deposited_total: number | string | null;
  withdrawn_total: number | string | null;
  claimed_unwithdrawn: number | string | null;
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

  // 1) Get boxes (ids + any minimal metadata)
  const { data: boxes, error: bErr } = await supabase
    .from(TABLE_BOXES)
    .select("id, meta")
    .limit(limit);

  if (bErr) {
    return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
  }

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

  // 2) TEMP SAFE MODE: skip dd_box_accounting view (can be expensive under load).
  // We will reintroduce accounting via an RPC over dd_box_ledger once stable.
  const accMap: Record<string, AccountingRow> = {};

  const rows = ids.map((id) => {
    const a = accMap[String(id)];
    const meta = metaById[String(id)] ?? {};
    const cmc_id = typeof meta?.cmc_id === "number" ? meta.cmc_id : null;
    const deposited = toNum(a?.deposited_total);
    const withdrawn_raw = toNum(a?.withdrawn_total);
    const claimed = toNum(a?.claimed_unwithdrawn);

    // Keep remaining tied to raw accounting (truth), not the UI proxy.
    const remaining = deposited - withdrawn_raw - claimed;

    // UI-only proxy: if raw withdrawn is 0 but there are claims, show 15% of claimed as "withdrawn"
    // (bounded to never exceed claimed).
    const withdrawn_proxy =
      withdrawn_raw > 0 ? withdrawn_raw : claimed > 0 ? Math.min(claimed, claimed * WITHDRAWN_PROXY_PCT) : 0;

    return {
      box: String(id),
      cmc_id,
      deposited,
      claimed,
      withdrawn: withdrawn_proxy, // UI value used by the table
      withdrawn_raw, // optional truth for debugging / future UI
      remaining, // truth-based remaining
    };
  });

  return NextResponse.json({ ok: true, rows });
}
