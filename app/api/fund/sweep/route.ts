import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, createDecipheriv } from "crypto";
import { createPublicClient, createWalletClient, http, Hex, parseAbi, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback != null) return fallback;
  throw new Error(`Missing env: ${name}`);
}

// AES-256-GCM decrypt (inverse of issue-address)
function decryptPrivKeyHex(encB64: string, secret: string): Hex {
  const buf = Buffer.from(encB64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const key = createHash("sha256").update(secret, "utf8").digest();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const out = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  if (!/^0x[0-9a-fA-F]{64}$/.test(out)) throw new Error("Bad decrypted key");
  return out as Hex;
}

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export async function POST(req: Request) {
  try {
    const j = await req.json().catch(() => ({} as any));
    const ref = typeof j?.ref === "string" ? j.ref.trim() : "";

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Build query first, then apply ref filter, then single()
    let q = sb
      .from("fund_positions")
      .select(
        `
        id,
        position_ref,
        issued_deposit_address,
        funded_usdt,
        status,
        deposit_tx_hash,
        sweep_tx_hash,
        fund_deposit_keys!inner(enc_privkey)
      `
      )
      .eq("status", "funded_locked")
      .is("sweep_tx_hash", null);

    if (ref) q = q.eq("position_ref", ref);

    const { data: pos, error } = await q.limit(1).single();
    if (error || !pos) throw new Error("No sweepable position found");

    // fund_deposit_keys comes back as an array
    const keys = (pos as any).fund_deposit_keys as { enc_privkey: string }[] | undefined;
    const enc = keys?.[0]?.enc_privkey;
    if (!enc) throw new Error("Missing deposit key");

    const priv = decryptPrivKeyHex(enc, env("FUND_KEY_ENC_SECRET"));
    const account = privateKeyToAccount(priv);

    const rpc = env("BSC_RPC_URL");
    const usdt = env("BSC_USDT_ADDRESS").toLowerCase() as Hex;
    const treasury = env("NEXT_PUBLIC_FUND_TREASURY_USDT_BEP20").toLowerCase() as Hex;
    const decimals = Number(env("BSC_USDT_DECIMALS", "18"));

    const publicClient = createPublicClient({ transport: http(rpc) });
    const walletClient = createWalletClient({ account, transport: http(rpc) });

    // Amount: use funded_usdt from DB (matches watcher validation)
    const funded = Number(pos.funded_usdt);
    if (!Number.isFinite(funded) || funded <= 0) throw new Error("Bad funded_usdt");

    const amount = BigInt(Math.round(funded * 10 ** decimals));

    // Optional: quick sanity check balance to reduce failed txs
    const bal = await publicClient.readContract({
      address: usdt,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });

    const balNum = Number(formatUnits(bal, decimals));
    if (!Number.isFinite(balNum) || bal < amount) {
      throw new Error(`Deposit address balance insufficient (${balNum} < ${funded})`);
    }

    const hash = await walletClient.writeContract({
      chain: null,
      address: usdt,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [treasury, amount],
    });

    await publicClient.waitForTransactionReceipt({ hash });

    await sb
      .from("fund_positions")
      .update({
        sweep_tx_hash: hash,
        swept_at: new Date().toISOString(),
        status: "swept_locked",
      })
      .eq("id", pos.id);

    return NextResponse.json({
      ok: true,
      position_ref: pos.position_ref,
      sweep_tx_hash: hash,
      from: account.address,
      to: treasury,
      amount_usdt: funded,
      status: "swept_locked",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "sweep failed" }, { status: 400 });
  }
}


