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
const TABLE_ACCOUNTING = "dd_box_accounting";

type BoxRow = { id: string | number | null };

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
    .select("id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (bErr) {
    return NextResponse.json({ ok: false, error: bErr.message }, { status: 500 });
  }

  const typedBoxes = (boxes ?? []) as BoxRow[];
  const ids = typedBoxes.map((b) => b.id).filter((v): v is string | number => v !== null && v !== undefined);

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, rows: [] });
  }

  // 2) Pull accounting for these boxes
  const { data: accRows, error: aErr } = await supabase
    .from(TABLE_ACCOUNTING)
    .select("box_id,deposited_total,withdrawn_total,claimed_unwithdrawn")
    .in("box_id", ids);

  if (aErr) {
    return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
  }

  const typedAcc = (accRows ?? []) as AccountingRow[];

  const accMap: Record<string, AccountingRow> = {};
  for (const r of typedAcc) {
    accMap[String(r.box_id ?? "")] = r;
  }

  const rows = ids.map((id) => {
    const a = accMap[String(id)];
    const deposited = toNum(a?.deposited_total);
    const withdrawn = toNum(a?.withdrawn_total);
    const claimed = toNum(a?.claimed_unwithdrawn);

    const remaining = deposited - withdrawn - claimed;

    return {
      box: String(id),
      deposited,
      claimed,
      withdrawn,
      remaining,
    };
  });

  return NextResponse.json({ ok: true, rows });
}
