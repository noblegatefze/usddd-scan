import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  getAddress,
  formatUnits,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

// ====== CONFIG ======
const RPC = process.env.BSC_RPC_URL;
const PK = process.env.PRIVATE_KEY;
if (!RPC) throw new Error("Missing BSC_RPC_URL");
if (!PK) throw new Error("Missing PRIVATE_KEY");

// Tokens (BSC)
const USDT = getAddress("0x55d398326f99059fF775485246999027B3197955");
const USDDD = getAddress("0x03f65216F340bAC39c8d1911288B1c7CA071e9c3");

// Pair (Pancake V2)
const PAIR = getAddress("0xbbb461d2246fad4eaa7306f369751bf7b72320a1");

// Pancake V2 Router
const ROUTER = getAddress("0x10ED43C718714eb63d5aA57B78B54704E256024E");

// ====== BEHAVIOR (tuned for load testing but RPC-safe) ======
const MODE = "load_peg";      // "peg_only" | "load_peg"
const TARGET = 1.0;
const BAND_PCT = 0.0035;      // 0.35%
const LOOP_DELAY_MS = 1200;   // slower than 1s to reduce RPC pressure
const SLIPPAGE_PCT = 0.01;    // 1%

const LOAD_MIN_USD = 8;
const LOAD_MAX_USD = 12;
const CORRECTIVE_MULT = 1.35;

// Inventory guardrails
const MIN_USDT_BAL = 50;
const MIN_USDDD_BAL = 200;

// Preflight
const PREFLIGHT_MIN_BNB = 0.01;
const PREFLIGHT_MIN_USDT = 25;
const PREFLIGHT_MIN_USDDD = 25;

// Token decimals
const DEC_USDT = 18;
const DEC_USDDD = 6;

// How often to refresh balances (every N loops)
const BALANCE_EVERY_N = 10;

// Receipt wait timeout (ms)
const RECEIPT_TIMEOUT_MS = 45_000;

// Backoff when RPC is rate-limiting
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 5 * 60_000;

// ====== ABIs ======
const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const PAIR_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
]);

const ROUTER_ABI = parseAbi([
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) returns (uint[] memory amounts)",
]);

// ====== CLIENTS ======
const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
const walletClient = createWalletClient({ chain: bsc, transport: http(RPC), account });

// ====== STOP CONTROL ======
let RUNNING = true;
process.on("SIGINT", () => {
  if (!RUNNING) return;
  console.log("\n🛑 Stop requested (Ctrl+C). Finishing current loop then exiting...");
  RUNNING = false;
});

// ====== HELPERS ======
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function applySlippage(expectedOut, slippagePct) {
  const bps = BigInt(Math.floor(slippagePct * 10_000));
  return (expectedOut * (10_000n - bps)) / 10_000n;
}

function isRateLimitError(e) {
  const msg = String(e?.shortMessage || e?.message || e);
  return msg.includes("Status: 429") || msg.toLowerCase().includes("rate limit") || msg.includes("daily request limit reached");
}

async function withBackoff(fn, label = "rpc") {
  let attempt = 0;
  while (RUNNING) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimitError(e)) throw e;

      attempt += 1;
      const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * attempt);
      console.log(`⏳ RPC rate-limited during ${label}. Backing off ${Math.round(wait / 1000)}s...`);
      await sleep(wait);
      // loop and retry
    }
  }
  throw new Error("Stopped");
}

async function ensureApproval(token, spender, needed) {
  const allowance = await withBackoff(
    () =>
      publicClient.readContract({
        address: token,
        abi: ERC20,
        functionName: "allowance",
        args: [account.address, spender],
      }),
    "allowance"
  );

  if (allowance >= needed) return;

  const approveAmt = needed * 200n;

  const hash = await walletClient.writeContract({
    address: token,
    abi: ERC20,
    functionName: "approve",
    args: [spender, approveAmt],
  });

  await withBackoff(() => publicClient.waitForTransactionReceipt({ hash }), "approve receipt");
  console.log("✅ Approved", token, "->", spender);
}

async function getBalances() {
  const [bnbRaw, usdtRaw, usdddRaw] = await Promise.all([
    withBackoff(() => publicClient.getBalance({ address: account.address }), "getBalance"),
    withBackoff(
      () => publicClient.readContract({ address: USDT, abi: ERC20, functionName: "balanceOf", args: [account.address] }),
      "usdt balance"
    ),
    withBackoff(
      () => publicClient.readContract({ address: USDDD, abi: ERC20, functionName: "balanceOf", args: [account.address] }),
      "usddd balance"
    ),
  ]);

  return {
    bnb: Number(formatUnits(bnbRaw, 18)),
    usdt: Number(formatUnits(usdtRaw, DEC_USDT)),
    usddd: Number(formatUnits(usdddRaw, DEC_USDDD)),
  };
}

async function preflight() {
  const bal = await getBalances();

  console.log("— Preflight —");
  console.log("Wallet:", account.address);
  console.log("BNB :", bal.bnb.toFixed(6));
  console.log("USDT:", bal.usdt.toFixed(6));
  console.log("USDDD:", bal.usddd.toFixed(6));

  const problems = [];
  if (bal.bnb < PREFLIGHT_MIN_BNB) problems.push(`BNB low (< ${PREFLIGHT_MIN_BNB})`);
  if (bal.usdt < PREFLIGHT_MIN_USDT) problems.push(`USDT low (< ${PREFLIGHT_MIN_USDT})`);
  if (bal.usddd < PREFLIGHT_MIN_USDDD) problems.push(`USDDD low (< ${PREFLIGHT_MIN_USDDD})`);

  if (problems.length) {
    console.log("\n❌ Preflight failed:");
    for (const p of problems) console.log(" -", p);
    console.log("\nFix balances then rerun.");
    process.exit(1);
  }

  console.log("✅ Preflight OK\n");
}

// Cache pair orientation ONCE (saves 2 eth_calls per loop!)
let ORIENTATION = null; // { usdtIs0: boolean }

async function initPairOrientation() {
  const token0 = await withBackoff(() => publicClient.readContract({ address: PAIR, abi: PAIR_ABI, functionName: "token0" }), "pair token0");
  const token1 = await withBackoff(() => publicClient.readContract({ address: PAIR, abi: PAIR_ABI, functionName: "token1" }), "pair token1");

  const t0 = getAddress(token0);
  const t1 = getAddress(token1);

  if (t0 === USDT && t1 === USDDD) ORIENTATION = { usdtIs0: true };
  else if (t0 === USDDD && t1 === USDT) ORIENTATION = { usdtIs0: false };
  else throw new Error("PAIR tokens are not USDT/USDDD");

  console.log("Pair orientation:", ORIENTATION.usdtIs0 ? "token0=USDT" : "token0=USDDD");
}

async function getPriceUSDTperUSDDD() {
  const [r0, r1] = await withBackoff(
    () => publicClient.readContract({ address: PAIR, abi: PAIR_ABI, functionName: "getReserves" }),
    "getReserves"
  );

  let reserveUSDT, reserveUSDDD;
  if (ORIENTATION.usdtIs0) {
    reserveUSDT = BigInt(r0);
    reserveUSDDD = BigInt(r1);
  } else {
    reserveUSDDD = BigInt(r0);
    reserveUSDT = BigInt(r1);
  }

  const usdt = Number(formatUnits(reserveUSDT, DEC_USDT));
  const usddd = Number(formatUnits(reserveUSDDD, DEC_USDDD));
  if (usddd === 0) throw new Error("Zero USDDD reserve");
  return usdt / usddd;
}

async function quoteOut(amountInRaw, path) {
  const amounts = await withBackoff(
    () => publicClient.readContract({ address: ROUTER, abi: ROUTER_ABI, functionName: "getAmountsOut", args: [amountInRaw, path] }),
    "getAmountsOut"
  );
  return amounts[amounts.length - 1];
}

async function swapExact(amountInRaw, path) {
  // MEV protection
  const expectedOut = await quoteOut(amountInRaw, path);
  const amountOutMin = applySlippage(expectedOut, SLIPPAGE_PCT);

  const deadline = Math.floor(Date.now() / 1000) + 45;

  const hash = await walletClient.writeContract({
    address: ROUTER,
    abi: ROUTER_ABI,
    functionName: "swapExactTokensForTokens",
    args: [amountInRaw, amountOutMin, path, account.address, BigInt(deadline)],
  });

  // Avoid crashing on receipt wait timeout; treat as "submitted" and continue
  try {
    await withBackoff(
      () => publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS }),
      "swap receipt"
    );
  } catch (e) {
    const msg = String(e?.shortMessage || e?.message || e);
    console.log("⚠️ Receipt wait issue (continuing):", msg.split("\n")[0]);
  }

  return { hash };
}

function pickNotionalUsd(isCorrective) {
  const base = rand(LOAD_MIN_USD, LOAD_MAX_USD);
  return isCorrective ? base * CORRECTIVE_MULT : base;
}

// ====== MAIN LOOP ======
async function run() {
  console.log("🟢 USDDD V2 Load/Peg Bot (RPC-safe)");
  console.log("MODE:", MODE);
  console.log("PAIR:", PAIR);
  console.log("ROUTER:", ROUTER);
  console.log("TARGET:", TARGET, "BAND_PCT:", BAND_PCT, "SLIPPAGE_PCT:", SLIPPAGE_PCT);
  console.log("LOAD_USD:", LOAD_MIN_USD, "-", LOAD_MAX_USD, "CORRECTIVE_MULT:", CORRECTIVE_MULT);
  console.log("Delay(ms):", LOOP_DELAY_MS);
  console.log("");

  await preflight();
  await initPairOrientation();

  let bal = await getBalances();
  let loop = 0;

  while (RUNNING) {
    loop += 1;

    // Refresh balances only every N loops (saves RPC)
    if (loop % BALANCE_EVERY_N === 1) {
      bal = await getBalances();
    }

    const price = await getPriceUSDTperUSDDD();
    const upper = TARGET * (1 + BAND_PCT);
    const lower = TARGET * (1 - BAND_PCT);

    console.log(
      "price:",
      price.toFixed(6),
      "band:",
      lower.toFixed(6),
      "-",
      upper.toFixed(6),
      "| bal usdt:",
      bal.usdt.toFixed(2),
      "usddd:",
      bal.usddd.toFixed(2),
      "bnb:",
      bal.bnb.toFixed(4)
    );

    const outsideHigh = price > upper;
    const outsideLow = price < lower;
    const isCorrective = outsideHigh || outsideLow;

    let dir;
    if (MODE === "peg_only") {
      if (outsideHigh) dir = "SELL";
      else if (outsideLow) dir = "BUY";
      else {
        await sleep(LOOP_DELAY_MS);
        continue;
      }
    } else {
      if (outsideHigh) dir = "SELL";
      else if (outsideLow) dir = "BUY";
      else dir = Math.random() < 0.5 ? "BUY" : "SELL";
    }

    // Inventory guardrails
    if (dir === "BUY" && bal.usdt < MIN_USDT_BAL) {
      console.log("SKIP BUY (low USDT inventory)");
      await sleep(LOOP_DELAY_MS);
      continue;
    }
    if (dir === "SELL" && bal.usddd < MIN_USDDD_BAL) {
      console.log("SKIP SELL (low USDDD inventory)");
      await sleep(LOOP_DELAY_MS);
      continue;
    }

    const notionalUsd = pickNotionalUsd(isCorrective);

    try {
      if (dir === "BUY") {
        const amtUSDT = notionalUsd;
        const amountIn = parseUnits(amtUSDT.toFixed(18), DEC_USDT);
        await ensureApproval(USDT, ROUTER, amountIn);

        const res = await swapExact(amountIn, [USDT, USDDD]);
        console.log((isCorrective ? "CORR" : "LOAD"), "BUY  USDT→USDDD", amtUSDT.toFixed(2), "tx:", res.hash);
      } else {
        const amtUSDDD = notionalUsd / clamp(price, 0.5, 2.0);
        const amountIn = parseUnits(amtUSDDD.toFixed(6), DEC_USDDD);
        await ensureApproval(USDDD, ROUTER, amountIn);

        const res = await swapExact(amountIn, [USDDD, USDT]);
        console.log((isCorrective ? "CORR" : "LOAD"), "SELL USDDD→USDT", amtUSDDD.toFixed(6), "tx:", res.hash);
      }
    } catch (e) {
      const msg = String(e?.shortMessage || e?.message || e);
      if (isRateLimitError(e)) {
        console.log("⏳ TX FAIL (rate-limited): backing off...");
        await sleep(BACKOFF_BASE_MS);
      } else {
        console.log("TX FAIL (protected/other):", msg.split("\n")[0]);
      }
    }

    await sleep(LOOP_DELAY_MS);
  }

  console.log("✅ Bot stopped.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
