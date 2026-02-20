import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, createDecipheriv } from "crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  Hex,
  parseAbi,
  parseUnits,
  formatUnits,
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
  throw new Error("Bad PK format (expected 64 hex chars)");
}

// AES-256-GCM decrypt (same style as your sweep route)
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

// USDDD mint + transfer (matches your existing mint route)
const USDDD_ABI = parseAbi([
  "function mintToTreasury(uint256 amount) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

// USDDD is 6 decimals (LOCKED)
const USDDD_DECIMALS = 6;

// Gas policy (reuse from sweep route, slightly higher cap for safety)
const GAS_TOPUP_CAP_BNB = 0.001;   // cap
const GAS_MIN_TOPUP_BNB = 0.00005; // avoid dust that still fails
const GAS_MULT_NUM = 125n;         // 1.25x
const GAS_MULT_DEN = 100n;

function jsonNoStore(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

function isLikelyEvmAddress(s: string) {
  const v = (s || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(v)) return false;
  if (v.toLowerCase() === "0x0000000000000000000000000000000000000000") return false;
  return true;
}

export async function POST(req: Request) {
  try {
    // secret gate (DO NOT make executor public)
    const secret = req.headers.get("x-exec-secret") ?? "";
    if (!secret || secret !== env("FUND_WITHDRAW_EXEC_SECRET")) {
      return jsonNoStore({ ok: false, error: "forbidden" }, 403);
    }

    const j = await req.json().catch(() => ({} as any));
    const withdrawal_id = typeof j?.id === "string" ? j.id.trim() : "";
    const ref = typeof j?.ref === "string" ? j.ref.trim() : "";

    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    // Maintenance gate (DB-authoritative)
    const { data: flags, error: flagsErr } = await sb.rpc("rpc_admin_flags");
    if (flagsErr) return jsonNoStore({ ok: false, paused: true }, 503);
    const row: any = Array.isArray(flags) ? flags[0] : flags;
    if (row && (row.pause_all || row.pause_reserve)) {
      return jsonNoStore({ ok: false, paused: true }, 503);
    }

    // 1) Pick a withdrawal to execute
    let wq = sb
      .from("fund_withdrawals")
      .select("id, position_id, position_ref, terminal_user_id, to_address, status, mint_tx_hash, sweep_tx_hash")
      .in("status", ["requested", "mint_failed", "sweep_failed", "minted"]);

    if (withdrawal_id) wq = wq.eq("id", withdrawal_id);
    if (ref) wq = wq.eq("position_ref", ref);

    const { data: w, error: wErr } = await wq.order("requested_at", { ascending: true }).limit(1).single();
    if (wErr || !w) throw new Error("No executable withdrawal found");

    if (!isLikelyEvmAddress(String(w.to_address || ""))) throw new Error("Bad withdrawal to_address");

    // 2) Load position (must be swept_locked, and unlocked when requested)
    const { data: pos, error: pErr } = await sb
      .from("fund_positions")
      .select(`
        id,
        position_ref,
        issued_deposit_address,
        status,
        locked,
        swept_at,
        usddd_allocated,
        usddd_accrued_display
      `)
      .eq("id", w.position_id)
      .limit(1)
      .single();

    if (pErr || !pos) throw new Error("Position not found for withdrawal");
    if (String(pos.status) !== "swept_locked") throw new Error(`Position not withdrawable in status=${pos.status}`);
    if (pos.locked !== false) throw new Error("Position is locked (admin must unlock before execution)");

    const allocated = Number(pos.usddd_allocated ?? 0);
    const accrued = Number(pos.usddd_accrued_display ?? 0);
    if (!Number.isFinite(allocated) || allocated <= 0) throw new Error("Bad usddd_allocated");
    if (!Number.isFinite(accrued) || accrued < 0) throw new Error("Bad usddd_accrued_display");

    const total = allocated + accrued;

    // 3) Freeze truth amounts into fund_withdrawals (execution snapshot)
    // (safe to re-run; overwrite same values)
    const freezeRes = await sb
      .from("fund_withdrawals")
      .update({
        amount_allocated_usddd: allocated,
        amount_accrued_usddd: accrued,
        amount_total_usddd: total,
        executing_at: new Date().toISOString(),
        status: "executing",
        last_error: null,
        last_error_at: null,
      })
      .eq("id", w.id)
      .select("id")
      .limit(1)
      .single();

    if (freezeRes.error) throw freezeRes.error;

    const rpcUrl = env("BSC_RPC_URL");
    const token = env("BSC_USDDD_ADDRESS", env("NEXT_PUBLIC_USDDD_TOKEN_BEP20")).toLowerCase() as Hex;

    // deposit key
    const { data: keyRow, error: keyErr } = await sb
      .from("fund_deposit_keys")
      .select("enc_privkey")
      .eq("position_id", pos.id)
      .limit(1)
      .single();

    if (keyErr || !keyRow?.enc_privkey) throw new Error("Missing deposit key");

    const depositPriv = decryptPrivKeyHex(String(keyRow.enc_privkey), env("FUND_KEY_ENC_SECRET"));
    const depositAccount = privateKeyToAccount(depositPriv);

    const mintPk = normalizePk(env("FUND_USDDD_MINTER_PK"));      // mint authority
    const treasuryPk = normalizePk(env("FUND_USDDD_TREASURY_PK")); // treasury pipe (EOA)
    const opsPk = normalizePk(env("FUND_GAS_TOPUP_PK"));          // ops wallet for gas topups (same as sweep)

    const mintAccount = privateKeyToAccount(mintPk);
    const treasuryAccount = privateKeyToAccount(treasuryPk);
    const opsAccount = privateKeyToAccount(opsPk);

    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const mintWallet = createWalletClient({ account: mintAccount, transport: http(rpcUrl) });
    const treasuryWallet = createWalletClient({ account: treasuryAccount, transport: http(rpcUrl) });
    const opsWallet = createWalletClient({ account: opsAccount, transport: http(rpcUrl) });
    const depositWallet = createWalletClient({ account: depositAccount, transport: http(rpcUrl) });

    const depositAddr = String(pos.issued_deposit_address).toLowerCase() as Hex;
    const toAddr = String(w.to_address).toLowerCase() as Hex;

    const accruedWei = parseUnits(String(accrued.toFixed(6)), USDDD_DECIMALS);
    const totalWei = parseUnits(String(total.toFixed(6)), USDDD_DECIMALS);

    // -------------------------
    // Helper: ensure deposit has BNB gas for USDDD transfer
    // -------------------------
    async function ensureDepositGasForTransfer(amountWei: bigint) {
      const balWei = await publicClient.getBalance({ address: depositAccount.address });
      const gasPrice = await publicClient.getGasPrice();

      const estGas = await publicClient.estimateContractGas({
        address: token,
        abi: USDDD_ABI,
        functionName: "transfer",
        args: [toAddr, amountWei],
        account: depositAccount.address,
      });

      const baseOverhead = 25_000n;
      const requiredWeiRaw = (estGas + baseOverhead) * gasPrice;
      const requiredWei = (requiredWeiRaw * GAS_MULT_NUM) / GAS_MULT_DEN;

      if (balWei >= requiredWei) return null;

      const deficitWei = requiredWei - balWei;
      const minWei = parseEther(String(GAS_MIN_TOPUP_BNB));
      const capWei = parseEther(String(GAS_TOPUP_CAP_BNB));
      const topUpWei = deficitWei < minWei ? minWei : deficitWei > capWei ? capWei : deficitWei;

      const topupHash = await opsWallet.sendTransaction({
        to: depositAccount.address,
        value: topUpWei,
        chain: null,
      });

      await publicClient.waitForTransactionReceipt({ hash: topupHash });
      return topupHash;
    }

    // -------------------------
    // 4) Mint accrued (ONLY) -> treasury, then transfer accrued -> deposit
    // Idempotent:
    // - if mint_tx_hash exists, skip mint stage
    // - BUT still ensure deposit has accrued before final sweep
    // -------------------------
    let mintTxOut: Hex | null = (w.mint_tx_hash as any) ?? null;
    let treasuryToDepositTxOut: Hex | null = null;

    if (accruedWei > 0n) {
      if (!mintTxOut) {
        try {
          const txHash = await mintWallet.writeContract({
            chain: null,
            address: token,
            abi: USDDD_ABI,
            functionName: "mintToTreasury",
            args: [accruedWei],
          });

          await publicClient.waitForTransactionReceipt({ hash: txHash });

          const { error: updErr } = await sb
            .from("fund_withdrawals")
            .update({
              mint_tx_hash: txHash,
              minted_at: new Date().toISOString(),
              status: "minted",
            })
            .eq("id", w.id)
            .is("mint_tx_hash", null);

          if (updErr) throw updErr;
          mintTxOut = txHash;
        } catch (e: any) {
          await sb
            .from("fund_withdrawals")
            .update({
              status: "mint_failed",
              last_error: String(e?.message ?? e),
              last_error_at: new Date().toISOString(),
              retry_count: (Number((await sb.from("fund_withdrawals").select("retry_count").eq("id", w.id).single()).data?.retry_count ?? 0) + 1),
            })
            .eq("id", w.id);

          throw e;
        }
      }

      // transfer accrued from treasury pipe -> deposit (not stored in withdrawals table; returned in response)
      // NOTE: This is safe to re-run; if it fails you can retry.
      treasuryToDepositTxOut = await treasuryWallet.writeContract({
        chain: null,
        address: token,
        abi: USDDD_ABI,
        functionName: "transfer",
        args: [depositAddr, accruedWei],
      });

      await publicClient.waitForTransactionReceipt({ hash: treasuryToDepositTxOut });
    }

    // -------------------------
    // 5) Sweep total (allocated + accrued) from deposit -> user destination
    // Idempotent: if sweep_tx_hash exists, skip.
    // -------------------------
    let sweepTxOut: Hex | null = (w.sweep_tx_hash as any) ?? null;

    if (!sweepTxOut) {
      try {
        // sanity: ensure deposit USDDD balance sufficient
        const bal = await publicClient.readContract({
          address: token,
          abi: USDDD_ABI,
          functionName: "balanceOf",
          args: [depositAccount.address],
        });

        if (bal < totalWei) {
          const balNum = Number(formatUnits(bal, USDDD_DECIMALS));
          throw new Error(`Deposit USDDD balance insufficient (${balNum} < ${total})`);
        }

        // ensure gas
        const gasTopupHash = await ensureDepositGasForTransfer(totalWei);

        const txHash = await depositWallet.writeContract({
          chain: null,
          address: token,
          abi: USDDD_ABI,
          functionName: "transfer",
          args: [toAddr, totalWei],
        });

        await publicClient.waitForTransactionReceipt({ hash: txHash });

        const nowIso = new Date().toISOString();

        await sb
          .from("fund_withdrawals")
          .update({
            sweep_tx_hash: txHash,
            swept_at: nowIso,
            status: "executed",
            executed_at: nowIso,
            last_error: null,
            last_error_at: null,
          })
          .eq("id", w.id)
          .is("sweep_tx_hash", null);

        // finalize position: stop accrual & prevent further withdraw
        await sb
          .from("fund_positions")
          .update({
            status: "withdrawn",
            locked: true,
          })
          .eq("id", pos.id);

        sweepTxOut = txHash;

        return jsonNoStore({
          ok: true,
          mode: "executed",
          withdrawal_id: w.id,
          position_ref: pos.position_ref,
          to_address: toAddr,
          allocated,
          accrued,
          total,
          mint_tx_hash: mintTxOut,
          treasury_to_deposit_tx_hash: treasuryToDepositTxOut,
          sweep_tx_hash: sweepTxOut,
          gas_topup_tx_hash: gasTopupHash,
        });
      } catch (e: any) {
        await sb
          .from("fund_withdrawals")
          .update({
            status: "sweep_failed",
            last_error: String(e?.message ?? e),
            last_error_at: new Date().toISOString(),
          })
          .eq("id", w.id);

        throw e;
      }
    }

    // already executed
    return jsonNoStore({
      ok: true,
      mode: "already_executed",
      withdrawal_id: w.id,
      position_ref: pos.position_ref,
      mint_tx_hash: mintTxOut,
      sweep_tx_hash: sweepTxOut,
    });
  } catch (e: any) {
    return jsonNoStore({ ok: false, error: e?.message ?? "withdraw execute failed" }, 400);
  }
}
