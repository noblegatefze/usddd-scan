import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, Hex, parseAbiItem, decodeEventLog, formatUnits } from "viem";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback != null) return fallback;
  throw new Error(`Missing env: ${name}`);
}

function isHexTx(h: any): h is Hex {
  return typeof h === "string" && /^0x([0-9a-fA-F]{64})$/.test(h);
}

const TRANSFER_ABI_ITEM = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export async function POST(req: Request) {
  try {
    const j = await req.json().catch(() => ({} as any));
    const ref = typeof j?.ref === "string" ? j.ref.trim() : "";
    const tx = typeof j?.tx_hash === "string" ? j.tx_hash.trim() : "";
    const sessionId = typeof j?.session_id === "string" ? j.session_id.trim() : "";

    if (!ref) throw new Error("Missing ref");
    if (!isHexTx(tx)) throw new Error("Bad tx_hash");

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // resolve terminal_user_id from dd_sessions (best-effort)
    let terminalUserId: string | null = null;
    if (sessionId) {
      const { data: srow } = await sb
        .from("dd_sessions")
        .select("user_id")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (srow?.user_id) terminalUserId = String(srow.user_id);
    }

    const { data: pos, error } = await sb
      .from("fund_positions")
      .select(
        "id, position_ref, issued_deposit_address, expected_min_usdt, expected_max_usdt, status, deposit_tx_hash, terminal_user_id"
      )
      .eq("position_ref", ref)
      .limit(1)
      .single();

    if (error || !pos) throw new Error("Position not found");

    // do not overwrite once set
    if (pos.deposit_tx_hash) {
      // If position already confirmed but missing terminal linkage, attach it now (best-effort)
      if (!pos.terminal_user_id && terminalUserId) {
        await sb.from("fund_positions").update({ terminal_user_id: terminalUserId }).eq("id", pos.id);
      }

      return NextResponse.json({
        ok: true,
        status: pos.status,
        position_ref: ref,
        note: "Already confirmed (deposit_tx_hash set).",
        terminal_user_id: (pos.terminal_user_id ?? terminalUserId) ?? null,
      });
    }

    if (String(pos.status) !== "awaiting_funds") {
      throw new Error(`Position not confirmable in status=${pos.status}`);
    }

    const rpcUrl = env("BSC_RPC_URL");
    const usdt = env("BSC_USDT_ADDRESS").toLowerCase() as Hex;
    const decimals = Number(env("BSC_USDT_DECIMALS", "18"));

    const client = createPublicClient({ transport: http(rpcUrl) });

    const receipt = await client.getTransactionReceipt({ hash: tx as Hex });
    if (!receipt) throw new Error("Receipt not found");
    if (receipt.status !== "success") throw new Error("Tx not successful");

    const toAddr = String(pos.issued_deposit_address).toLowerCase();

    // find a Transfer log emitted by USDT where "to" == deposit address
    let amountRaw: bigint | null = null;

    for (const lg of receipt.logs) {
      if (String(lg.address).toLowerCase() !== usdt) continue;
      if (!lg.topics || lg.topics.length < 3) continue;
      if (
        String(lg.topics[0]).toLowerCase() !==
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      )
        continue;

      try {
        const decoded = decodeEventLog({
          abi: [TRANSFER_ABI_ITEM],
          data: lg.data,
          topics: lg.topics as any,
        });

        const to = String((decoded.args as any).to).toLowerCase();
        if (to !== toAddr) continue;

        amountRaw = BigInt((decoded.args as any).value);
        break;
      } catch {
        continue;
      }
    }

    if (amountRaw == null) throw new Error("No matching USDT Transfer(to=deposit) log found in tx");

    const amount = Number(formatUnits(amountRaw, decimals));
    const min = Number(pos.expected_min_usdt);
    const max = Number(pos.expected_max_usdt);

    if (!Number.isFinite(amount)) throw new Error("Bad decoded amount");
    if (amount < min || amount > max) throw new Error(`Amount out of bounds (${amount} not in [${min}, ${max}])`);

    // funded_at from the block timestamp
    const blk = await client.getBlock({ blockNumber: receipt.blockNumber });
    const fundedAtIso = new Date(Number(blk.timestamp) * 1000).toISOString();

    const updatePayload: any = {
      deposit_tx_hash: tx,
      funded_usdt: amount,
      funded_at: fundedAtIso,
      status: "funded_locked",
    };
    if (terminalUserId) updatePayload.terminal_user_id = terminalUserId;

    const { data: updRows, error: updErr } = await sb
      .from("fund_positions")
      .update(updatePayload)
      .eq("id", pos.id)
      .eq("status", "awaiting_funds")
      .is("deposit_tx_hash", null)
      .select("id");

    if (updErr) throw updErr;
    if (!updRows || updRows.length === 0) throw new Error("Position updated by someone else");

    // Auto-sweep immediately after confirm
    const origin = new URL(req.url).origin;

    let sweep: any = null;
    try {
      const sr = await fetch(`${origin}/api/fund/sweep`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref }),
        cache: "no-store",
      });
      sweep = await sr.json();
    } catch (e: any) {
      sweep = { ok: false, error: e?.message ?? "sweep call failed" };
    }

    // Auto-mint immediately after sweep success (idempotent route)
    let mint: any = null;
    if (sweep?.ok) {
      try {
        const mr = await fetch(`${origin}/api/fund/mint`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ref }),
          cache: "no-store",
        });
        mint = await mr.json();
      } catch (e: any) {
        mint = { ok: false, error: e?.message ?? "mint call failed" };
      }
    }

    return NextResponse.json({
      ok: true,
      position_ref: ref,
      deposit_tx_hash: tx,
      funded_usdt: amount,
      funded_at: fundedAtIso,
      terminal_user_id: terminalUserId,
      status: sweep?.ok ? "swept_locked" : "funded_locked",
      sweep,
      mint,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "confirm failed" }, { status: 400 });
  }
}
