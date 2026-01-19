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

  const ids = (boxes ?? []).map((b: any) => b.id).filter(Boolean);

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

  const accMap: Record<string, any> = {};
  (accRows ?? []).forEach((r: any) => {
    accMap[String(r.box_id)] = r;
  });

  const rows = ids.map((id) => {
    const a = accMap[String(id)] ?? {};
    const deposited = Number(a.deposited_total ?? 0) || 0;
    const withdrawn = Number(a.withdrawn_total ?? 0) || 0;
    const claimed = Number(a.claimed_unwithdrawn ?? 0) || 0;

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
