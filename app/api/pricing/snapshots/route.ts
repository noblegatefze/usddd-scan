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
    if (Number.isFinite(id) && Number.isFinite(price) && price > 0) {
      out.set(id, price);
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    // Protect the endpoint (cron only)
    const secret = env("SNAPSHOT_CRON_SECRET");
    const url = new URL(req.url);
    const gotHeader = req.headers.get("x-cron-secret");
    const gotQuery = url.searchParams.get("secret");
    const got = gotHeader || gotQuery;

    if (got !== secret) {

      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Pull active boxes + their cmc_id from meta
    const { data: boxes, error } = await supabase
      .from("dd_boxes")
      .select("id, token_symbol, token_chain_id, meta, status")
      .eq("status", "ACTIVE");

    if (error) throw error;

    const rows = (boxes ?? [])
      .map((b: any) => {
        const sym = String(b.token_symbol ?? "").trim().toUpperCase();
        const chain = String(b.token_chain_id ?? "").trim().toUpperCase();
        const cmc_id = asInt(b?.meta?.cmc_id ?? b?.meta?.["cmc_id"]);
        return { box_id: b.id, token_symbol: sym, chain_id: chain, cmc_id };
      })
      .filter(r => r.token_symbol && r.chain_id);

    const withId = rows.filter(r => r.cmc_id);
    const ids = Array.from(new Set(withId.map(r => r.cmc_id!)));

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, note: "no boxes with cmc_id" });
    }

    // Batch fetch prices
    const priceMap = await fetchCmcUsdPricesById(ids);

    const asOf = new Date().toISOString();

    // Build snapshot inserts (skip tokens with no cmc_id or no returned price)
    const inserts = withId
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

    if (inserts.length === 0) {
      return NextResponse.json({
        ok: true,
        inserted: 0,
        note: "cmc returned no prices for ids",
        ids_requested: ids.length,
      });
    }

    const { error: insErr } = await supabase
      .from("dd_token_price_snapshots")
      .insert(inserts);

    if (insErr) throw insErr;

    return NextResponse.json({
      ok: true,
      inserted: inserts.length,
      as_of: asOf,
      ids_requested: ids.length,
      ids_priced: priceMap.size,
      skipped_no_cmc_id: rows.length - withId.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
