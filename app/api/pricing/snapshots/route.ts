import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function asInt(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

async function fetchCmcUsdPricesById(ids: number[]): Promise<Map<number, number>> {
  const key = process.env.COINMARKETCAP_API_KEY || process.env.CMC_API_KEY;
  if (!key) throw new Error("Missing env: COINMARKETCAP_API_KEY (or CMC_API_KEY)");

  const url =
    `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest` +
    `?id=${encodeURIComponent(ids.join(","))}&convert=USD`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      "X-CMC_PRO_API_KEY": key,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`CMC fetch failed: ${r.status} ${r.statusText} ${txt}`.slice(0, 300));
  }

  const j: any = await r.json().catch(() => null);
  const data = j?.data ?? {};

  const out = new Map<number, number>();
  for (const k of Object.keys(data)) {
    const id = Number(k);
    const price = Number(data?.[k]?.quote?.USD?.price);
    if (Number.isFinite(id) && Number.isFinite(price) && price > 0) out.set(id, price);
  }
  return out;
}

function getAuthSecret(req: NextRequest): { got: string | null; expected: string } {
  const expected = env("SNAPSHOT_CRON_SECRET");
  const url = new URL(req.url);
  const gotHeader = req.headers.get("x-cron-secret");
  const gotQuery = url.searchParams.get("secret");
  const got = gotHeader || gotQuery;
  return { got, expected };
}

async function handler(req: NextRequest) {
  // Protect the endpoint (cron only)
  const { got, expected } = getAuthSecret(req);
  if (got !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  // Pull active boxes + their cmc_id from meta (authoritative)
  const { data: boxes, error } = await supabase
    .from("dd_boxes")
    .select("id, token_symbol, token_chain_id, token_address, meta, status")
    .eq("status", "ACTIVE");

  if (error) throw error;

  const rows = (boxes ?? [])
    .map((b: any) => {
      const token_symbol = String(b.token_symbol ?? "").trim().toUpperCase();
      const chain_id = String(b.token_chain_id ?? "").trim().toUpperCase();
      const token_address = String(b.token_address ?? "").trim(); // canonical key (addr snapshots)
      const cmc_id = asInt(b?.meta?.cmc_id ?? b?.meta?.["cmc_id"]);
      return { box_id: b.id, token_symbol, chain_id, token_address, cmc_id };
    })
    .filter(r => r.token_symbol && r.chain_id);

  const withId = rows.filter(r => r.cmc_id);
  const ids = Array.from(new Set(withId.map(r => r.cmc_id!)));

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, inserted_symbol: 0, inserted_addr: 0, note: "no boxes with cmc_id" });
  }

  // Batch fetch prices
  const priceMap = await fetchCmcUsdPricesById(ids);
  const asOf = new Date().toISOString();

  // Build snapshot inserts (symbol table) — backwards compatible
  const insertsSymbol = withId
    .map(r => {
      const price = priceMap.get(r.cmc_id!);
      if (!price) return null;
      return {
        token_symbol: r.token_symbol,
        chain_id: r.chain_id,
        price_usd: price,
        source: "cmc",
        as_of: asOf,
      };
    })
    .filter(Boolean) as any[];

  // Build snapshot inserts (address table) — canonical
  // Only insert when token_address exists (never invent/fallback)
  const insertsAddr = withId
    .map(r => {
      const price = priceMap.get(r.cmc_id!);
      if (!price) return null;
      if (!r.token_address) return null;
      return {
        chain_id: r.chain_id,
        token_address: r.token_address,
        price_usd: price,
        source: "cmc",
        as_of: asOf,
      };
    })
    .filter(Boolean) as any[];

  let inserted_symbol = 0;
  if (insertsSymbol.length > 0) {
    const { error: insErr } = await supabase.from("dd_token_price_snapshots").insert(insertsSymbol);
    if (insErr) throw insErr;
    inserted_symbol = insertsSymbol.length;
  }

  let inserted_addr = 0;
  if (insertsAddr.length > 0) {
    const { error: insErr2 } = await supabase.from("dd_token_price_snapshots_addr").insert(insertsAddr);
    if (insErr2) throw insErr2;
    inserted_addr = insertsAddr.length;
  }

  return NextResponse.json({
    ok: true,
    as_of: asOf,
    ids_requested: ids.length,
    ids_priced: priceMap.size,
    inserted_symbol,
    inserted_addr,
    skipped_no_cmc_id: rows.length - withId.length,
    skipped_no_token_address: withId.filter(r => !r.token_address).length,
  });
}

// Vercel Cron hits GET. Keep POST for manual runs.
export async function GET(req: NextRequest) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
