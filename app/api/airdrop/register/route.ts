import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

function ipHash(ip: string | null) {
  if (!ip) return null;
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) >>> 0;
  return `ip_${h.toString(16)}`;
}

function normalizeAddress(input: string) {
  return String(input || "")
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, "")
    .trim()
    .toLowerCase();
}

function isEvmAddressLoose(a: string) {
  return /^0x[a-f0-9]{40}$/.test(a);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const raw = String(body?.address ?? "");
    const source = String(body?.source || "usddd_scan_modal").trim();

    const address = normalizeAddress(raw);
    if (!isEvmAddressLoose(address)) {
      return NextResponse.json({ ok: false, error: "Invalid address" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;

    const { data, error } = await supabase.rpc("rpc_airdrop_register_wallet", {
      p_address: address,
      p_source: source,
      p_ip_hash: ipHash(ip),
      p_user_agent: ua,
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      already: Boolean(row?.already),
      count: Number(row?.count ?? 0),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
