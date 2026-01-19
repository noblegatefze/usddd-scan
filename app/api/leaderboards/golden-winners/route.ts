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

// Keep masking consistent with scan (ASCII only)
function maskUsername(u: string | null | undefined) {
  const raw = (u ?? "").trim();
  if (!raw) {
    const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
    return `anon-${rand}`;
  }
  if (raw.toLowerCase().startsWith("anon-")) return raw;

  const s = raw.replace(/\s+/g, " ");
  if (s.length <= 6) return `${s.slice(0, 1)}...${s.slice(-1)}`;
  return `${s.slice(0, 3)}...${s.slice(-3)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 10), 1), 50);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Pull a reasonable recent window to compute leaders (keeps it fast).
  // We'll use last 30 days by default; adjust later if you want "all-time".
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from(TABLE_GOLDEN_EVENTS)
    .select("terminal_username, usd_value, created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000); // cap

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const byUser: Record<
    string,
    { winner: string; wins: number; usd_total: number }
  > = {};

  for (const r of data ?? []) {
    const winner = maskUsername((r as any).terminal_username);
    const key = winner;
    const usd = Number((r as any).usd_value ?? 0) || 0;

    if (!byUser[key]) byUser[key] = { winner, wins: 0, usd_total: 0 };
    byUser[key].wins += 1;
    byUser[key].usd_total += usd;
  }

  const rows = Object.values(byUser)
    .sort((a, b) => b.usd_total - a.usd_total || b.wins - a.wins)
    .slice(0, limit);

  return NextResponse.json({
    ok: true,
    window_days: 30,
    rows,
  });
}
