import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function reqEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");

const TABLE_GOLDEN_EVENTS = "dd_tg_golden_events";
const TABLE_GOLDEN_CLAIMS = "dd_tg_golden_claims";

type GoldenEventRow = {
  id: number;
  created_at: string | null;
  claim_code: string | null;
  terminal_username: string | null;
  token: string | null;
  chain: string | null;
  usd_value: number | string | null;
};

/**
 * Keep it simple: do NOT try to strip unicode aggressively.
 * We just normalize whitespace and mask with ASCII "...".
 * (Windows console + ConvertTo-Json can display unicode ellipsis weirdly.)
 */
function maskUsername(u: string | null | undefined) {
  const raw = (u ?? "").trim();

  if (!raw) {
    const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
    return `anon-${rand}`;
  }

  // preserve anon-XXXX if already present
  if (raw.toLowerCase().startsWith("anon-")) return raw;

  const s = raw.replace(/\s+/g, " ");

  // ASCII masking only (NO unicode ellipsis)
  if (s.length <= 6) return `${s.slice(0, 1)}...${s.slice(-1)}`;
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
}

function toUsd(v: number | string | null | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 20), 1),
    50
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Maintenance gate (DB-authoritative)
  const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
  if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
  const row: any = Array.isArray(flags) ? flags[0] : flags;
  if (row && row.pause_all) return NextResponse.json({ ok: false, paused: true }, { status: 503 });

  // 1) Fetch latest golden events (include id so we can link to claims)
  const { data, error } = await supabase
    .from(TABLE_GOLDEN_EVENTS)
    .select("id, created_at, claim_code, terminal_username, token, chain, usd_value")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const typed = (data ?? []) as GoldenEventRow[];

  // 2) Fetch tx hashes from claims table keyed by golden_event_id
  const eventIds = typed.map((r) => r.id).filter((v) => Number.isFinite(v));
  const txByEventId = new Map<number, string>();

  if (eventIds.length > 0) {
    const { data: claims, error: claimsErr } = await supabase
      .from(TABLE_GOLDEN_CLAIMS)
      .select("golden_event_id, paid_tx_hash")
      .in("golden_event_id", eventIds);

    if (claimsErr) {
      return NextResponse.json({ ok: false, error: claimsErr.message }, { status: 500 });
    }

    for (const c of claims ?? []) {
      const eid = Number((c as any).golden_event_id);
      const tx = String((c as any).paid_tx_hash ?? "").trim();
      if (Number.isFinite(eid) && tx) {
        // First win is fine (should be 1:1 in practice)
        if (!txByEventId.has(eid)) txByEventId.set(eid, tx);
      }
    }
  }

  // 3) Shape response
  const rows = typed.map((r) => ({
    ts: r.created_at ?? null,
    claim: r.claim_code ?? null,
    winner: maskUsername(r.terminal_username),
    token: r.token ?? null,
    chain: r.chain ?? null,
    usd: toUsd(r.usd_value),
    tx: txByEventId.get(r.id) ?? null, // <-- NEW
  }));

  return NextResponse.json({ ok: true, rows });
}
