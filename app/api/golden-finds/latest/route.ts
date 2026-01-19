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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? 20), 1),
    50
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from(TABLE_GOLDEN_EVENTS)
    .select("created_at, claim_code, terminal_username, token, chain, usd_value")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((r: any) => ({
    ts: r.created_at ?? null,
    claim: r.claim_code ?? null,

    // what the UI should use
    winner: maskUsername(r.terminal_username),

    token: r.token ?? null,
    chain: r.chain ?? null,
    usd: typeof r.usd_value === "number" ? r.usd_value : Number(r.usd_value ?? 0) || 0,
  }));

  return NextResponse.json({ ok: true, rows });
}
