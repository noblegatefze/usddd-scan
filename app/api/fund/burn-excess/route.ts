import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, createDecipheriv } from "crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  Hex,
  parseAbi,
} from "viem";
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

const USDDD_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function burn(uint256 amount)",
]);

const TOKEN = "0x03f65216F340bAC39c8d1911288B1c7CA071e9c3" as Hex;

// USDDD is 6 decimals
const TARGET_RAW = 100000000n; // 100 * 10^6

export async function POST(req: Request) {
  try {
    const j = await req.json().catch(() => ({} as any));
    const ref = typeof j?.ref === "string" ? j.ref.trim() : "";
    if (!ref) throw new Error("Missing ref");

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: pos, error: posErr } = await sb
      .from("fund_positions")
      .select("id, position_ref, issued_deposit_address, status, usddd_burn_tx_hash")
      .eq("position_ref", ref)
      .limit(1)
      .single();

    if (posErr || !pos) throw new Error("Position not found");

    // one-off guard so we can't burn twice accidentally
    if (pos.usddd_burn_tx_hash) {
      return NextResponse.json({
        ok: true,
        position_ref: ref,
        note: "Already burned (usddd_burn_tx_hash set).",
        usddd_burn_tx_hash: pos.usddd_burn_tx_hash,
      });
    }

    const { data: keyRow, error: keyErr } = await sb
      .from("fund_deposit_keys")
      .select("enc_privkey")
      .eq("position_id", pos.id)
      .limit(1)
      .single();

    if (keyErr || !keyRow?.enc_privkey) throw new Error("Missing deposit key");

    const rpcUrl = env("BSC_RPC_URL");
    const publicClient = createPublicClient({ transport: http(rpcUrl) });

    const depositAddr = String(pos.issued_deposit_address).toLowerCase() as Hex;

    const bal = await publicClient.readContract({
      address: TOKEN,
      abi: USDDD_ABI,
      functionName: "balanceOf",
      args: [depositAddr],
    });

    if (bal <= TARGET_RAW) {
      return NextResponse.json({
        ok: true,
        position_ref: ref,
        note: "No excess to burn (balance <= target).",
        balance_raw: bal.toString(),
        target_raw: TARGET_RAW.toString(),
        excess_raw: "0",
      });
    }

    const excess = bal - TARGET_RAW;

    const depositPriv = decryptPrivKeyHex(keyRow.enc_privkey as any, env("FUND_KEY_ENC_SECRET"));
    const depositAccount = privateKeyToAccount(depositPriv);
    if (depositAccount.address.toLowerCase() !== depositAddr.toLowerCase()) {
      throw new Error("Deposit key does not match issued_deposit_address");
    }

    const depositWallet = createWalletClient({ account: depositAccount, transport: http(rpcUrl) });

    const burnTx = await depositWallet.writeContract({
      chain: null,
      address: TOKEN,
      abi: USDDD_ABI,
      functionName: "burn",
      args: [excess],
    });

    await publicClient.waitForTransactionReceipt({ hash: burnTx });

    await sb
      .from("fund_positions")
      .update({
        usddd_burn_tx_hash: burnTx,
        usddd_burned_at: new Date().toISOString(),
      })
      .eq("id", pos.id)
      .is("usddd_burn_tx_hash", null);

    return NextResponse.json({
      ok: true,
      position_ref: ref,
      deposit: depositAddr,
      balance_raw_before: bal.toString(),
      target_raw: TARGET_RAW.toString(),
      excess_burned_raw: excess.toString(),
      usddd_burn_tx_hash: burnTx,
      note: "Excess burned; target 100.000000 retained.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "burn failed" }, { status: 400 });
  }
}
