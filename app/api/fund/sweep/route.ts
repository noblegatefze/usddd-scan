import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, createDecipheriv } from "crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  Hex,
  parseAbi,
  formatUnits,
  parseUnits,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (fallback != null) return fallback;
  throw new Error(`Missing env: ${name}`);
}

function normalizePk(pk: string): Hex {
  const s = pk.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s as Hex;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return (`0x${s}`) as Hex;
  throw new Error("Bad FUND_GAS_TOPUP_PK format (expected 64 hex chars)");
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

// Hard-coded (per scope)
const GAS_TOPUP_THRESHOLD_BNB = 0.0006; // if deposit EOA has less than this, it will fail to sweep often
const GAS_TOPUP_AMOUNT_BNB = 0.002;     // enough for a couple txs comfortably on BSC

export async function POST(req: Request) {
  try {
    const j = await req.json().catch(() => ({} as any));
    const ref = typeof j?.ref === "string" ? j.ref.trim() : "";

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // find a sweepable position
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
        gas_topup_tx_hash,
        gas_topup_bnb,
        gas_topup_at
      `
      )
      .eq("status", "funded_locked")
      .is("sweep_tx_hash", null);

    if (ref) q = q.eq("position_ref", ref);

    const { data: pos, error } = await q.limit(1).single();
    if (error || !pos) throw new Error("No sweepable position found");

    // Fetch deposit key separately (avoid fragile join/relationship issues)
    const { data: keyRow, error: keyErr } = await sb
      .from("fund_deposit_keys")
      .select("enc_privkey")
      .eq("position_id", pos.id)
      .limit(1)
      .single();

    if (keyErr || !keyRow?.enc_privkey) throw new Error("Missing deposit key");

    const depositPriv = decryptPrivKeyHex(keyRow.enc_privkey as Hex, env("FUND_KEY_ENC_SECRET"));
    const depositAccount = privateKeyToAccount(depositPriv);

    const rpc = env("BSC_RPC_URL");
    const usdt = env("BSC_USDT_ADDRESS").toLowerCase() as Hex;
    const treasury = env("NEXT_PUBLIC_FUND_TREASURY_USDT_BEP20").toLowerCase() as Hex;
    const decimals = Number(env("BSC_USDT_DECIMALS", "18"));

    const publicClient = createPublicClient({ transport: http(rpc) });
    const depositWallet = createWalletClient({ account: depositAccount, transport: http(rpc) });

    // 1) Auto gas top-up if needed
    const balWei = await publicClient.getBalance({ address: depositAccount.address });
    const balBnb = Number(formatUnits(balWei, 18));

    if (balBnb < GAS_TOPUP_THRESHOLD_BNB) {
      // only do one automated top-up per position in this sweep flow
      if (pos.gas_topup_tx_hash) {
        throw new Error(
          `Deposit EOA needs gas (${balBnb} BNB). Top-up already recorded; cannot auto-topup twice.`
        );
      }

      const opsPk = normalizePk(env("FUND_GAS_TOPUP_PK"));
      const opsAccount = privateKeyToAccount(opsPk);
      const opsWallet = createWalletClient({ account: opsAccount, transport: http(rpc) });

      const topupHash = await opsWallet.sendTransaction({
        to: depositAccount.address,
        value: parseEther(String(GAS_TOPUP_AMOUNT_BNB)),
        chain: null,
      });

      await publicClient.waitForTransactionReceipt({ hash: topupHash });

      await sb
        .from("fund_positions")
        .update({
          gas_topup_tx_hash: topupHash,
          gas_topup_bnb: GAS_TOPUP_AMOUNT_BNB,
          gas_topup_at: new Date().toISOString(),
        })
        .eq("id", pos.id);
    }

    // 2) Sweep USDT using funded_usdt from DB
    const fundedStr = String(pos.funded_usdt ?? "").trim();
    const funded = Number(fundedStr);
    if (!Number.isFinite(funded) || funded <= 0) throw new Error("Bad funded_usdt");

    // Safe 18-decimals conversion (no JS float math)
    const amount = parseUnits(fundedStr, decimals);

    // sanity check balance to reduce failed txs
    const usdtBal = await publicClient.readContract({
      address: usdt,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [depositAccount.address],
    });

    const usdtBalNum = Number(formatUnits(usdtBal, decimals));
    if (!Number.isFinite(usdtBalNum) || usdtBal < amount) {
      throw new Error(`Deposit address balance insufficient (${usdtBalNum} < ${funded})`);
    }

    const sweepHash = await depositWallet.writeContract({
      chain: null,
      address: usdt,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [treasury, amount],
    });

    await publicClient.waitForTransactionReceipt({ hash: sweepHash });

    await sb
      .from("fund_positions")
      .update({
        sweep_tx_hash: sweepHash,
        swept_at: new Date().toISOString(),
        status: "swept_locked",
      })
      .eq("id", pos.id);

    return NextResponse.json({
      ok: true,
      position_ref: pos.position_ref,
      gas_topup_tx_hash: pos.gas_topup_tx_hash ?? null,
      sweep_tx_hash: sweepHash,
      from: depositAccount.address,
      to: treasury,
      amount_usdt: funded,
      status: "swept_locked",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "sweep failed" }, { status: 400 });
  }
}
