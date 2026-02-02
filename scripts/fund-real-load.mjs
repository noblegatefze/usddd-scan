/**
 * Fund Network Real-Cycle Load Test (LOCAL ONLY)
 *
 * Client payloads match app/fund/page.tsx:
 * - issue-address: POST (no body)
 * - bind: POST { session_id, refs }
 * - confirm: POST { ref, tx_hash, session_id }
 *
 * Modes:
 *  --preflight true   (default)  -> only print balances and exit (no API, no chain)
 *  --dry true                     -> issue-address + bind only (NO chain tx, NO confirm)
 *  --preflight false --dry false  -> full real cycle (chain tx + confirm + wait + recycle)
 *  --resumeRef REF                -> resume mode: wait for completion of existing REF
 *  --recycleAmount N              -> in resume mode, send N USDT from pipe -> payer (no new deposits)
 *
 * Examples:
 *  # Preflight (no chain tx)
 *  node scripts/fund-real-load.mjs --base https://usddd.digdug.do --session 1223A086 --preflight true
 *
 *  # Dry (issue+bind only)
 *  node scripts/fund-real-load.mjs --base https://usddd.digdug.do --session 1223A086 --n 1 --dry true --preflight false --apiTimeout 90000
 *
 *  # Real closed-loop (deposit then recycle same amount) - 2 cycles random 200-500
 *  node scripts/fund-real-load.mjs --base https://usddd.digdug.do --session 1223A086 --n 2 --min 200 --max 500 --poll 4000 --apiTimeout 90000 --preflight false --dry false
 *
 *  # Resume + recycle-only
 *  node scripts/fund-real-load.mjs --base https://usddd.digdug.do --session 1223A086 --resumeRef FN-DCC13EB9 --recycleAmount 200 --apiTimeout 90000 --preflight false --dry false
 */

import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ---- args ----
const args = Object.fromEntries(
  process.argv.slice(2)
    .map((x, i, a) => {
      if (!x.startsWith("--")) return [];
      const k = x.slice(2);
      const v = a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : "true";
      return [k, v];
    })
    .filter(Boolean)
);

const BASE = (args.base || "http://localhost:3000").replace(/\/$/, "");
const SESSION_ID = String(args.session || process.env.TERMINAL_SESSION_ID || "").trim();

const N = parseInt(args.n || "1", 10);
const MIN = parseFloat(args.min || "200");
const MAX = parseFloat(args.max || "1000");

const POLL_MS = parseInt(args.poll || "4000", 10);
const MAX_WAIT_MS = parseInt(args.maxwait || String(20 * 60 * 1000), 10); // 20min
const JITTER_MS = parseInt(args.jitter || "600", 10);

const PREFLIGHT = String(args.preflight ?? "true").toLowerCase() !== "false";
const DRY = String(args.dry ?? "false").toLowerCase() === "true";

const RESUME_REF = String(args.resumeRef || "").trim();
const RECYCLE_AMOUNT = parseFloat(args.recycleAmount || "0");

const API_TIMEOUT_MS = parseInt(args.apiTimeout || "20000", 10); // 20s (override with --apiTimeout 90000)
const RPC_TIMEOUT_MS = parseInt(args.rpcTimeout || "60000", 10); // 60s

// ---- chain ----
const BSC_RPC = process.env.BSC_RPC_URL;
if (!BSC_RPC) throw new Error("Missing env: BSC_RPC_URL");

// BEP-20 USDT (BNB chain)
const USDT = process.env.USDT_BSC || "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = parseInt(process.env.USDT_DECIMALS || "18", 10);

// ---- wallets (LOCAL ONLY) ----
const PAYER_PK = process.env.PAYER_PRIVATE_KEY;
const PIPE_PK = process.env.PIPE_PRIVATE_KEY;
if (!PAYER_PK) throw new Error("Missing env: PAYER_PRIVATE_KEY");
if (!PIPE_PK) throw new Error("Missing env: PIPE_PRIVATE_KEY");

const payer = privateKeyToAccount(PAYER_PK);
const pipe = privateKeyToAccount(PIPE_PK);

const publicClient = createPublicClient({ transport: http(BSC_RPC, { timeout: RPC_TIMEOUT_MS }) });
const payerClient = createWalletClient({ account: payer, transport: http(BSC_RPC, { timeout: RPC_TIMEOUT_MS }) });
const pipeClient = createWalletClient({ account: pipe, transport: http(BSC_RPC, { timeout: RPC_TIMEOUT_MS }) });

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function jitter(base = JITTER_MS) {
  return sleep(Math.floor(base * 0.4 + Math.random() * base));
}
function randAmount(min, max) {
  const v = min + Math.random() * (max - min);
  const step = 10;
  return Math.round(v / step) * step;
}
function toUnits(amountFloat, decimals) {
  const whole = BigInt(Math.round(amountFloat)); // integer amounts only
  return whole * (10n ** BigInt(decimals));
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`TIMEOUT after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

async function fetchJson(path, opts = {}) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...opts,
      headers: { "content-type": "application/json", ...(opts.headers || {}) },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${res.statusText} ${path}`);
      err.details = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

// ---- API wrappers (matching app/fund/page.tsx) ----
async function apiIssueAddress() {
  const j = await fetchJson("/api/fund/issue-address", { method: "POST" });
  if (!j?.ok) throw new Error(j?.error ?? "issue-address failed");
  if (!j.position?.ref) throw new Error("issue-address ok but missing position.ref");
  return j.position;
}

async function apiBind(session_id, refs) {
  const j = await fetchJson("/api/fund/bind", {
    method: "POST",
    body: JSON.stringify({ session_id, refs }),
  });
  if (!j?.ok) throw new Error(j?.error ?? "bind failed");
  return j;
}

async function apiConfirm(ref, tx_hash, session_id) {
  const j = await fetchJson("/api/fund/confirm", {
    method: "POST",
    body: JSON.stringify({ ref, tx_hash, session_id: session_id || null }),
  });
  if (!j?.ok) throw new Error(j?.error ?? "confirm failed");
  return j;
}

async function apiPositionsBySession(session_id) {
  const j = await fetchJson("/api/fund/positions", {
    method: "POST",
    body: JSON.stringify({ session_id }),
  });
  if (j?.ok && Array.isArray(j.positions)) return j.positions;
  return [];
}

// ---- chain helpers ----
async function usdtBalance(addr) {
  return await publicClient.readContract({
    address: USDT,
    abi: erc20,
    functionName: "balanceOf",
    args: [addr],
  });
}

async function sendUsdt(walletClient, fromAccount, to, amount) {
  const amt = toUnits(amount, USDT_DECIMALS);

  const hash = await walletClient.writeContract({
    address: USDT,
    abi: erc20,
    functionName: "transfer",
    args: [to, amt],
    account: fromAccount,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`USDT transfer failed: ${hash}`);
  return hash;
}

// ---- completion detection ----
function isCompleted(row) {
  // Strongest truth in your schema: usddd_allocated > 0 means done
  const alloc = Number(row?.usddd_allocated ?? 0);
  if (alloc > 0) return true;

  const s = String(row?.status || row?.stage || "").toLowerCase();
  return s.includes("allocat") || s.includes("mint") || s.includes("swept_locked");
}

async function waitUntilCompleted(ref, session_id) {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const rows = await withTimeout(apiPositionsBySession(session_id), API_TIMEOUT_MS, "positions(session)");
    const row = rows.find((r) => (r.position_ref || r.ref || r.id) === ref) || null;

    if (row && isCompleted(row)) return row;
    await sleep(POLL_MS);
  }

  throw new Error(`Timeout waiting for completion ref=${ref}`);
}

// ---- cycle ----
async function runOneCycle(i, refs) {
  // RESUME mode: wait for existing ref, optionally recycle-only
  if (RESUME_REF) {
    console.log(`RESUME: waiting for completion ref=${RESUME_REF}...`);
    const finalRow = await waitUntilCompleted(RESUME_REF, SESSION_ID);
    console.log(`RESUME: completed status=${finalRow.status}`);

    if (RECYCLE_AMOUNT > 0) {
      console.log(`RESUME: recycle-only pipe -> payer ${RECYCLE_AMOUNT} USDT`);
      const pipeBal = await usdtBalance(pipe.address);

      if (pipeBal < toUnits(RECYCLE_AMOUNT, USDT_DECIMALS)) {
        throw new Error(`Pipe USDT too low to recycle ${RECYCLE_AMOUNT}`);
      }

      const tx = await withTimeout(
        sendUsdt(pipeClient, pipe, payer.address, RECYCLE_AMOUNT),
        RPC_TIMEOUT_MS,
        "pipe transfer"
      );

      console.log(`RESUME: recycled tx=${tx}`);
      return { ok: true, i, amount: 0, ref: RESUME_REF, stage: finalRow.status, recycled: true };
    }

    return { ok: true, i, amount: 0, ref: RESUME_REF, stage: finalRow.status, recycled: false };
  }

  // Normal cycle: issue -> bind -> send -> confirm -> wait -> recycle same amount
  const amount = randAmount(MIN, MAX);

  console.log(`cycle ${i + 1}/${N}: ISSUE address...`);
  const p = await withTimeout(apiIssueAddress(), API_TIMEOUT_MS, "issue-address");

  const ref = p.ref;
  const deposit = p.deposit_address || p.address || p.depositAddress;
  console.log(`issued ref=${ref} deposit=${deposit}`);

  if (!deposit) throw new Error("issue-address returned missing deposit address");

  refs.push(ref);

  console.log(`cycle ${i + 1}/${N}: BIND session -> ref`);
  // Keep bind small: bind just the new ref
  await withTimeout(apiBind(SESSION_ID, [ref]), API_TIMEOUT_MS, "bind");

  if (DRY) {
    console.log(`cycle ${i + 1}/${N}: DRY mode -> stopping after issue+bind (no tx).`);
    return { ok: true, i, amount, ref, deposit, stage: "issued_bound", recycled: false };
  }

  console.log(`cycle ${i + 1}/${N}: SEND ${amount} USDT payer -> deposit`);
  const depositTx = await withTimeout(
    sendUsdt(payerClient, payer, deposit, amount),
    RPC_TIMEOUT_MS,
    "payer transfer"
  );

  console.log(`cycle ${i + 1}/${N}: CONFIRM tx_hash=${depositTx}`);
  await withTimeout(apiConfirm(ref, depositTx, SESSION_ID), API_TIMEOUT_MS, "confirm");

  console.log(`cycle ${i + 1}/${N}: WAIT completion...`);
  const finalRow = await waitUntilCompleted(ref, SESSION_ID);

  console.log(`cycle ${i + 1}/${N}: COMPLETED status=${finalRow.status} usddd_allocated=${finalRow.usddd_allocated}`);

  // AUTO-RECYCLE: pipe -> payer same amount
  console.log(`cycle ${i + 1}/${N}: RECYCLE pipe -> payer ${amount} USDT`);
  const pipeBal = await usdtBalance(pipe.address);

  if (pipeBal < toUnits(amount, USDT_DECIMALS)) {
    throw new Error(`Pipe USDT too low to recycle ${amount}`);
  }

  const recycleTx = await withTimeout(
    sendUsdt(pipeClient, pipe, payer.address, amount),
    RPC_TIMEOUT_MS,
    "pipe transfer"
  );

  console.log(`cycle ${i + 1}/${N}: RECYCLED tx=${recycleTx}`);

  return {
    ok: true,
    i,
    amount,
    ref,
    deposit,
    depositTx,
    recycleTx,
    stage: finalRow.status,
    recycled: true,
  };
}

async function main() {
  if (!SESSION_ID) throw new Error("Missing --session or TERMINAL_SESSION_ID.");

  console.log(`BASE=${BASE}`);
  console.log(`SESSION_ID=${SESSION_ID}`);
  console.log(`N=${N} range=${MIN}-${MAX} poll=${POLL_MS}ms`);
  console.log(`preflightOnly=${PREFLIGHT} dry=${DRY}`);
  console.log(`payer=${payer.address}`);
  console.log(`pipe=${pipe.address}`);
  console.log(`usdt=${USDT}\n`);

  const pb = await usdtBalance(payer.address);
  const pib = await usdtBalance(pipe.address);
  console.log(`preflight payer USDT=${pb.toString()}`);
  console.log(`preflight pipe  USDT=${pib.toString()}\n`);

  if (PREFLIGHT) {
    console.log("PREFLIGHT OK — exiting before any deposits/transactions.");
    return;
  }

  console.log("ENTERING LOOP...\n");

  const refs = [];
  const results = [];
  const started = Date.now();

  for (let i = 0; i < N; i++) {
    try {
      await jitter();
      const r = await runOneCycle(i, refs);
      results.push(r);
      console.log(`[${i + 1}/${N}] OK ref=${r.ref} stage=${r.stage} recycled=${r.recycled}\n`);
    } catch (e) {
      console.log(`[${i + 1}/${N}] FAIL ${e.message}`);
      if (e.details) console.log("  details:", JSON.stringify(e.details).slice(0, 800));
      results.push({ ok: false, i, err: e.message, details: e.details || null });
      await sleep(2500);
      break; // stop on first failure for safety
    }
  }

  const ms = Date.now() - started;
  const ok = results.filter((x) => x.ok).length;
  const fail = results.length - ok;
  console.log(`\nDone ${(ms / 1000).toFixed(1)}s ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
