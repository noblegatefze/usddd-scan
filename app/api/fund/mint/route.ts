import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  http,
  Hex,
  parseAbi,
  parseUnits,
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
  throw new Error("Bad PK format (expected 64 hex chars)");
}

// Minimal ABI for Fund Network mint + treasury sweep
const USDDD_ABI = parseAbi([
  "function mintToTreasury(uint256 amount) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
]);

export async function POST(req: Request) {
  try {
    const j = await req.json().catch(() => ({} as any));
    const ref = typeof j?.ref === "string" ? j.ref.trim() : "";

    if (!ref) throw new Error("Missing ref");

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Load position (must be swept_locked)
    const { data: pos, error } = await sb
      .from("fund_positions")
      .select(
        `
        id,
        position_ref,
        issued_deposit_address,
        funded_usdt,
        status,
        sweep_tx_hash,
        swept_at,
        usddd_mint_tx_hash,
        usddd_minted_at,
        usddd_transfer_tx_hash,
        usddd_transferred_at,
        usddd_accrual_started_at
      `
      )
      .eq("position_ref", ref)
      .limit(1)
      .single();

    if (error || !pos) throw new Error("Position not found");

    if (String(pos.status) !== "swept_locked") {
      throw new Error(`Position not mintable in status=${pos.status}`);
    }
    if (!pos.sweep_tx_hash) throw new Error("Missing sweep_tx_hash");
    if (pos.funded_usdt == null || Number(pos.funded_usdt) <= 0) throw new Error("Bad funded_usdt");

    const rpcUrl = env("BSC_RPC_URL");

    // USDDD proxy/token address
    const token = env("BSC_USDDD_ADDRESS", env("NEXT_PUBLIC_USDDD_TOKEN_BEP20")).toLowerCase() as Hex;

    const usdddDecimals = Number(env("BSC_USDDD_DECIMALS", "18"));
    const amountStr = String(pos.funded_usdt).trim();
    const amountWei = parseUnits(amountStr, usdddDecimals);

    // Signers (server-only)
    const mintPk = normalizePk(env("FUND_USDDD_MINTER_PK"));
    const treasuryPk = normalizePk(env("FUND_USDDD_TREASURY_PK"));

    const mintAccount = privateKeyToAccount(mintPk);
    const treasuryAccount = privateKeyToAccount(treasuryPk);

    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const mintWallet = createWalletClient({ account: mintAccount, transport: http(rpcUrl) });
    const treasuryWallet = createWalletClient({ account: treasuryAccount, transport: http(rpcUrl) });

    // -------------------------
    // 1) Mint (idempotent)
    // -------------------------
    let mintTx: Hex | null = (pos.usddd_mint_tx_hash as any) ?? null;

    if (!mintTx) {
      const txHash = await mintWallet.writeContract({
        chain: null,
        address: token,
        abi: USDDD_ABI,
        functionName: "mintToTreasury",
        args: [amountWei],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // update only if still null (idempotent guard)
      const { error: updErr } = await sb
        .from("fund_positions")
        .update({
          usddd_mint_tx_hash: txHash,
          usddd_minted_at: new Date().toISOString(),
        })
        .eq("id", pos.id)
        .is("usddd_mint_tx_hash", null);

      if (updErr) throw updErr;
      mintTx = txHash;
    }

    // -------------------------
    // 2) Transfer (allocate) from Treasury Pipe -> deposit address (idempotent)
    // -------------------------
    let transferTx: Hex | null = (pos.usddd_transfer_tx_hash as any) ?? null;

    if (!transferTx) {
      const toAddr = String(pos.issued_deposit_address).toLowerCase() as Hex;

      const txHash = await treasuryWallet.writeContract({
        chain: null,
        address: token,
        abi: USDDD_ABI,
        functionName: "transfer",
        args: [toAddr, amountWei],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      const nowIso = new Date().toISOString();
      const accrualStart = pos.usddd_accrual_started_at ?? pos.swept_at ?? nowIso;

      const { error: updErr } = await sb
        .from("fund_positions")
        .update({
          usddd_transfer_tx_hash: txHash,
          usddd_transferred_at: nowIso,
          // fund network custody allocation
          usddd_allocated: Number(amountStr),
          // start display-only accrual clock deterministically
          usddd_accrual_started_at: accrualStart,
          // display starts at 0; UI will compute increasing value from accrual_started_at
          usddd_accrued_display: 0,
        })
        .eq("id", pos.id)
        .is("usddd_transfer_tx_hash", null);

      if (updErr) throw updErr;

      transferTx = txHash;
    }

    return NextResponse.json({
      ok: true,
      position_ref: ref,
      status: "swept_locked",
      usddd_amount: Number(amountStr),
      usddd_mint_tx_hash: mintTx,
      usddd_transfer_tx_hash: transferTx,
      note: "Idempotent: safe to re-call.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "mint failed" }, { status: 400 });
  }
}
