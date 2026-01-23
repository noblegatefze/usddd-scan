import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, createDecipheriv } from "crypto";
import { createWalletClient, createPublicClient, http, Hex, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function env(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
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
  if (!out.startsWith("0x")) throw new Error("Bad decrypted key");
  return out as Hex;
}

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)"
]);

export async function POST(req: Request) {
  try {
    const { ref } = await req.json().catch(() => ({}));

    const sb = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    // Fetch one sweepable position (or by ref)
    let q = sb
      .from("fund_positions")
      .select(`
        id,
        position_ref,
        issued_deposit_address,
        funded_usdt,
        status,
        deposit_tx_hash,
        fund_deposit_keys!inner(enc_privkey)
      `)
      .eq("status", "funded_locked")
      .is("sweep_tx_hash", null)
      .limit(1)
      .single();

    if (ref) q = q.eq("position_ref", ref);

    const { data: pos, error } = await q;
    if (error || !pos) throw new Error("No sweepable position found");

    const priv = decryptPrivKeyHex(
      pos.fund_deposit_keys.enc_privkey,
      env("FUND_KEY_ENC_SECRET")
    );

    const account = privateKeyToAccount(priv);

    const rpc = env("BSC_RPC_URL");
    const usdt = env("BSC_USDT_ADDRESS") as Hex;
    const treasury = env("NEXT_PUBLIC_FUND_TREASURY_USDT_BEP20") as Hex;
    const decimals = Number(env("BSC_USDT_DECIMALS", "18"));

    const amount = BigInt(Math.round(Number(pos.funded_usdt) * 10 ** decimals));

    const publicClient = createPublicClient({ transport: http(rpc) });
    const walletClient = createWalletClient({
      account,
      transport: http(rpc),
    });

    const hash = await walletClient.writeContract({
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
      to: treasury,
      amount_usdt: pos.funded_usdt,
      status: "swept_locked",
    });

  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "sweep failed" },
      { status: 400 }
    );
  }
}
