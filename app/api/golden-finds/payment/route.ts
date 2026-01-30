import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function reqEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = reqEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");

// Phase Zero payout wallet (BNB / BEP-20)
const PAYOUT_FROM =
  process.env.NEXT_PUBLIC_PHASE_ZERO_GOLDEN_FIND_PAYOUT_FROM ?? null;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const claim = (url.searchParams.get("claim") ?? "").trim();

  if (!claim) {
    return NextResponse.json({ ok: false, error: "Missing claim" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Maintenance gate (DB-authoritative)
  const { data: flags, error: flagsErr } = await supabase.rpc("rpc_admin_flags");
  if (flagsErr) return NextResponse.json({ ok: false, paused: true }, { status: 503 });
  const row: any = Array.isArray(flags) ? flags[0] : flags;
  if (row && row.pause_all) return NextResponse.json({ ok: false, paused: true }, { status: 503 });

  // 1) Find event by claim_code
  const { data: ev, error: evErr } = await supabase
    .from("dd_tg_golden_events")
    .select("id, claim_code, token, chain, usd_value, created_at")
    .eq("claim_code", claim)
    .maybeSingle();

  if (evErr) return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 });
  if (!ev?.id) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // 2) Find claim/payout record (if any)
  const { data: c, error: cErr } = await supabase
    .from("dd_tg_golden_claims")
    .select("claimed_at, payout_usdt_bep20, paid_at, paid_tx_hash")
    .eq("golden_event_id", ev.id)
    .maybeSingle();

  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });

  const status = c?.paid_at ? "PAID" : c ? "PENDING" : "UNCLAIMED";

  return NextResponse.json({
    ok: true,

    // basic context
    claim_code: ev.claim_code ?? claim,
    token: ev.token ?? null,
    chain: ev.chain ?? null,
    usd_value: ev.usd_value ?? null,
    golden_at: ev.created_at ?? null,

    // payout status
    status,
    claimed_at: c?.claimed_at ?? null,

    payout_from: PAYOUT_FROM,
    payout_to: c?.payout_usdt_bep20 ?? null,

    paid_at: c?.paid_at ?? null,
    paid_tx_hash: c?.paid_tx_hash ?? null,
  });
}
