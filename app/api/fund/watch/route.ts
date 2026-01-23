import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbiItem, Hex, formatUnits } from "viem";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback != null) return fallback;
  throw new Error(`Missing env: ${name}`);
}

function isHexTx(h: any): h is Hex {
  return typeof h === "string" && /^0x([0-9a-fA-F]{64})$/.test(h);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ref = (url.searchParams.get("ref") ?? "").trim();
    const address = (url.searchParams.get("address") ?? "").trim().toLowerCase();

    const supabaseUrl = env("SUPABASE_URL");
    const supabaseKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const rpcUrl = env("BSC_RPC_URL");
    const usdt = env("BSC_USDT_ADDRESS").toLowerCase() as Hex;

    const watchBlocks = Number(env("FUND_WATCH_BLOCKS", "1500"));
    const chunkSize = Number(env("FUND_WATCH_CHUNK", "100"));
    const decimals = Number(env("BSC_USDT_DECIMALS", "18"));

    if (!Number.isFinite(watchBlocks) || watchBlocks <= 0) throw new Error("Bad FUND_WATCH_BLOCKS");
    if (!Number.isFinite(chunkSize) || chunkSize <= 0 || chunkSize > 2000) throw new Error("Bad FUND_WATCH_CHUNK");

    const client = createPublicClient({ transport: http(rpcUrl) });

    let q = sb
      .from("fund_positions")
      .select("id, position_ref, issued_deposit_address, expected_min_usdt, expected_max_usdt, status, deposit_tx_hash");

    if (ref) q = q.eq("position_ref", ref);
    if (address) q = q.eq("issued_deposit_address", address);
    if (!ref && !address) q = q.eq("status", "awaiting_funds");

    const { data: positions, error } = await q.limit(50);
    if (error) throw error;

    const latest = await client.getBlockNumber();
    const fromBase = latest > BigInt(watchBlocks) ? latest - BigInt(watchBlocks) : BigInt(0);

    const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

    const updates: any[] = [];
    const checked: any[] = [];

    for (const p of positions ?? []) {
      const toAddr = String(p.issued_deposit_address ?? "").toLowerCase();
      if (!toAddr.startsWith("0x") || toAddr.length !== 42) continue;

      if (!ref && !address && p.deposit_tx_hash) continue;

      const min = Number(p.expected_min_usdt);
      const max = Number(p.expected_max_usdt);

      let found: { txHash: Hex; amt: number; blockNumber: bigint } | null = null;

      // scan in small block chunks to avoid RPC "limit exceeded"
      let cursor = fromBase;
      while (cursor <= latest) {
        const toBlock = cursor + BigInt(chunkSize) - 1n;
        const end = toBlock > latest ? latest : toBlock;

        const logs = await client.getLogs({
          address: usdt,
          event: transferEvent,
          fromBlock: cursor,
          toBlock: end,
          args: { to: toAddr as Hex },
        });

        checked.push({ ref: p.position_ref, chunk_from: cursor.toString(), chunk_to: end.toString(), logs: logs.length });

        if (logs.length) {
          for (const lg of logs) {
            const raw = lg.args?.value;
            if (raw == null) continue;

            const amt = Number(formatUnits(raw, decimals));
            if (!Number.isFinite(amt)) continue;
            if (amt < min || amt > max) continue;

            const txHash = lg.transactionHash;
            if (!isHexTx(txHash)) continue;

            found = { txHash, amt, blockNumber: lg.blockNumber };
            break;
          }
        }

        if (found) break;
        cursor = end + 1n;
      }

      if (!found) continue;

      const blk = await client.getBlock({ blockNumber: found.blockNumber });
      const fundedAtIso = new Date(Number(blk.timestamp) * 1000).toISOString();

      await sb
        .from("fund_positions")
        .update({
          deposit_tx_hash: found.txHash,
          funded_usdt: found.amt,
          funded_at: fundedAtIso,
          status: "funded_locked",
        })
        .eq("id", p.id);

      updates.push({
        id: p.id,
        position_ref: p.position_ref,
        issued_deposit_address: toAddr,
        deposit_tx_hash: found.txHash,
        funded_usdt: found.amt,
        funded_at: fundedAtIso,
        status: "funded_locked",
      });
    }

    return NextResponse.json({
      ok: true,
      scanned: positions?.length ?? 0,
      watch_blocks: watchBlocks,
      chunk_size: chunkSize,
      from_block: fromBase.toString(),
      to_block: latest.toString(),
      updates,
      checked: checked.slice(0, 25), // keep response small
      note: "Chunked watcher: avoids public RPC getLogs limits by scanning in small block ranges.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "watch failed" }, { status: 400 });
  }
}

