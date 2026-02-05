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

// =========================
// CONFIG
// =========================
const RPC = process.env.BSC_RPC_URL;
const PK = process.env.PRIVATE_KEY;
if (!RPC) throw new Error("Missing BSC_RPC_URL");
if (!PK) throw new Error("Missing PRIVATE_KEY");

// Tokens (BSC)
const USDT = getAddress("0x55d398326f99059fF775485246999027B3197955"); // BSC USDT (18)
const USDDD = getAddress("0x03f65216F340bAC39c8d1911288B1c7CA071e9c3"); // USDDD (6)

// Pair (Pancake V2)
const PAIR = getAddress("0xbbb461d2246fad4eaa7306f369751bf7b72320a1");

// Pancake V2 Router
const ROUTER = getAddress("0x10ED43C718714eb63d5aA57B78B54704E256024E");

// =========================
// BEHAVIOR
// =========================

// 1) Hard band limits (absolute, not %)
const BAND_LOW = 0.9990;
const BAND_HIGH = 1.0010;

// 4) React every ~5s, with jitter to avoid being predictable
const LOOP_BASE_MS = 10_000;
const LOOP_JITTER_MS = 2_500; // keep some randomness

// Slippage protection (keep modest; widen if pool is thin)
const SLIPPAGE_PCT_NORMAL = 0.006; // 0.6%
const SLIPPAGE_PCT_CORR = 0.01;    // 1.0%

// Random “load” trade sizes (when IN band)
const LOAD_MIN_USD = 2;
const LOAD_MAX_USD = 6;

// Corrective trade sizes (when OUT of band)
const CORR_MIN_USD = 4;
const CORR_MAX_USD = 12;

// If far outside the band, scale corrective size a bit
const FAR_OUT_MULT = 1.5; // only applied when deviation is large

// Inventory / risk controls
const PREFLIGHT_MIN_BNB = 0.01;

// Keep a USDT reserve you refuse to spend below (prevents bleeding USDT)
const USDT_RESERVE_FLOOR = 200; // <-- set this to what you want to always keep

// Spend caps (prevent death-spiral if price drifts)
const MAX_USDT_SPEND_PER_HOUR = 4250;  // cap how much USDT we can spend buying USDDD per hour
const MAX_USDDD_SELL_PER_HOUR = 7500;  // cap how much USDDD we can sell per hour

// Don’t trade if balances are tiny
const MIN_USDT_TO_BUY = 15;
const MIN_USDDD_TO_SELL = 60;

// Balance refresh cadence
const BALANCE_EVERY_N = 3;

// Receipt wait timeout
const RECEIPT_TIMEOUT_MS = 45_000;

// RPC backoff
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 5 * 60_000;

// Decimals
const DEC_USDT = 18;
const DEC_USDDD = 6;

// =========================
// ABIs
// =========================
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

// =========================
// CLIENTS
// =========================
const account = privateKeyToAccount(PK);
const publicClient = createPublicClient({ chain: bsc, transport: http(RPC) });
const walletClient = createWalletClient({ chain: bsc, transport: http(RPC), account });

// =========================
// STOP CONTROL
// =========================
let RUNNING = true;
process.on("SIGINT", () => {
  if (!RUNNING) return;
  console.log("\n🛑 Stop requested (Ctrl+C). Finishing current loop then exiting...");
  RUNNING = false;
});

// =========================
// HELPERS
// =========================
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
  return (
    msg.includes("Status: 429") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.includes("daily request limit reached")
  );
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

  // over-approve to avoid repeated approves
  const approveAmt = needed * 500n;

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
  if (bal.usdt < MIN_USDT_TO_BUY) problems.push(`USDT low (< ${MIN_USDT_TO_BUY})`);
  if (bal.usddd < MIN_USDDD_TO_SELL) problems.push(`USDDD low (< ${MIN_USDDD_TO_SELL})`);

  if (problems.length) {
    console.log("\n⚠️ Preflight warnings:");
    for (const p of problems) console.log(" -", p);
    console.log("Continuing anyway (you may see many SKIPs).\n");
  } else {
    console.log("✅ Preflight OK\n");
  }
}

// Cache pair orientation once
let ORIENTATION = null; // { usdtIs0: boolean }

async function initPairOrientation() {
  const token0 = await withBackoff(
    () => publicClient.readContract({ address: PAIR, abi: PAIR_ABI, functionName: "token0" }),
    "pair token0"
  );
  const token1 = await withBackoff(
    () => publicClient.readContract({ address: PAIR, abi: PAIR_ABI, functionName: "token1" }),
    "pair token1"
  );

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

async function swapExact(amountInRaw, path, slippagePct) {
  const expectedOut = await quoteOut(amountInRaw, path);
  const amountOutMin = applySlippage(expectedOut, slippagePct);
  const deadline = Math.floor(Date.now() / 1000) + 45;

  const hash = await walletClient.writeContract({
    address: ROUTER,
    abi: ROUTER_ABI,
    functionName: "swapExactTokensForTokens",
    args: [amountInRaw, amountOutMin, path, account.address, BigInt(deadline)],
  });

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

// =========================
// “DON’T BLEED USDT” CONTROLS
// =========================
let START_USDT = null;
let START_USDDD = null;

function mtmUSDT(usdtBal, usdddBal, price) {
  // mark-to-market in USDT terms (approx)
  return usdtBal + usdddBal * price;
}

// hourly caps
let hourBucket = null;
let spentUSDTThisHour = 0;
let soldUSDDDThisHour = 0;

function resetHourBucket() {
  const now = new Date();
  const key = `${now.getUTCFullYear()}-${now.getUTCMonth()+1}-${now.getUTCDate()}-${now.getUTCHours()}`;
  if (hourBucket !== key) {
    hourBucket = key;
    spentUSDTThisHour = 0;
    soldUSDDDThisHour = 0;
  }
}

// choose action
function pickLoadDirection() {
  // Random but slightly mean-reverting inside band:
  // nearer low -> bias BUY, nearer high -> bias SELL
  return "RANDOM_MEAN_REVERT";
}

function pickNotionalLoad() {
  return rand(LOAD_MIN_USD, LOAD_MAX_USD);
}

function pickNotionalCorrective(price) {
  const base = rand(CORR_MIN_USD, CORR_MAX_USD);
  const dev = price < BAND_LOW ? (BAND_LOW - price) : (price > BAND_HIGH ? (price - BAND_HIGH) : 0);
  const far = dev > 0.01; // >1% outside band => “far”
  return far ? base * FAR_OUT_MULT : base;
}

function chooseDirAndSize(price) {
  // OUTSIDE band => corrective only
  if (price < BAND_LOW) {
    return { mode: "CORR", dir: "BUY", notionalUsd: pickNotionalCorrective(price) };
  }
  if (price > BAND_HIGH) {
    return { mode: "CORR", dir: "SELL", notionalUsd: pickNotionalCorrective(price) };
  }

  // INSIDE band => random load with mild mean-reversion bias
  const mid = (BAND_LOW + BAND_HIGH) / 2;
  const span = (BAND_HIGH - BAND_LOW) / 2;
  const z = clamp((price - mid) / span, -1, 1); // -1 at low, +1 at high

  // Bias: if price high, more SELL; if low, more BUY
  const pSell = clamp(0.5 + 0.20 * z, 0.25, 0.75); // 25%..75%
  const r = Math.random();
  const dir = r < pSell ? "SELL" : "BUY";

  return { mode: "LOAD", dir, notionalUsd: pickNotionalLoad() };
}

// =========================
// MAIN LOOP
// =========================
async function run() {
  console.log("🟢 USDDD V2 Band Keeper + Load (risk-controlled)");
  console.log("PAIR:", PAIR);
  console.log("ROUTER:", ROUTER);
  console.log("BAND:", BAND_LOW.toFixed(4), "to", BAND_HIGH.toFixed(4));
  console.log("Tick:", LOOP_BASE_MS, "ms (+ jitter)");
  console.log("");

  await preflight();
  await initPairOrientation();

  let bal = await getBalances();
  const price0 = await getPriceUSDTperUSDDD();
  START_USDT = bal.usdt;
  START_USDDD = bal.usddd;

  console.log("Start USDT:", START_USDT.toFixed(4), "Start USDDD:", START_USDDD.toFixed(4), "Start price:", price0.toFixed(6));
  console.log("Start MTM (USDT):", mtmUSDT(START_USDT, START_USDDD, price0).toFixed(4));
  console.log("");

  let loop = 0;

  while (RUNNING) {
    loop += 1;
    resetHourBucket();

    // refresh balances every N loops
    if (loop % BALANCE_EVERY_N === 1) {
      bal = await getBalances();
    }

    const price = await getPriceUSDTperUSDDD();
    const inBand = price >= BAND_LOW && price <= BAND_HIGH;

    const mtmNow = mtmUSDT(bal.usdt, bal.usddd, price);
    const mtmStart = mtmUSDT(START_USDT, START_USDDD, price);
    const mtmDelta = mtmNow - mtmStart;

    console.log(
      `price:${price.toFixed(6)} band:[${BAND_LOW.toFixed(4)}..${BAND_HIGH.toFixed(4)}] ${inBand ? "IN" : "OUT"}` +
        ` | usdt:${bal.usdt.toFixed(2)} usddd:${bal.usddd.toFixed(2)} bnb:${bal.bnb.toFixed(4)}` +
        ` | MTMΔ:${mtmDelta.toFixed(3)}`
    );

    const { mode, dir, notionalUsd } = chooseDirAndSize(price);

    // === Risk controls (USDT reserve + hourly caps)
    // Reserve floor blocks excessive buying
    const usdtSpendAllowed = Math.max(0, bal.usdt - USDT_RESERVE_FLOOR);
    const hourSpendRemaining = Math.max(0, MAX_USDT_SPEND_PER_HOUR - spentUSDTThisHour);
    const hourSellRemaining = Math.max(0, MAX_USDDD_SELL_PER_HOUR - soldUSDDDThisHour);

    if (dir === "BUY") {
      if (bal.usdt < MIN_USDT_TO_BUY) {
        console.log("SKIP BUY (USDT too low)");
        await sleep(LOOP_BASE_MS + rand(0, LOOP_JITTER_MS));
        continue;
      }
      if (usdtSpendAllowed <= 0) {
        console.log(`SKIP BUY (reserve floor active: keep >= ${USDT_RESERVE_FLOOR} USDT)`);
        await sleep(LOOP_BASE_MS + rand(0, LOOP_JITTER_MS));
        continue;
      }
      if (hourSpendRemaining <= 0) {
        console.log(`SKIP BUY (hourly spend cap reached: ${MAX_USDT_SPEND_PER_HOUR} USDT/hr)`);
        await sleep(LOOP_BASE_MS + rand(0, LOOP_JITTER_MS));
        continue;
      }
    } else {
      if (bal.usddd < MIN_USDDD_TO_SELL) {
        console.log("SKIP SELL (USDDD too low)");
        await sleep(LOOP_BASE_MS + rand(0, LOOP_JITTER_MS));
        continue;
      }
      if (hourSellRemaining <= 0) {
        console.log(`SKIP SELL (hourly sell cap reached: ${MAX_USDDD_SELL_PER_HOUR} USDDD/hr)`);
        await sleep(LOOP_BASE_MS + rand(0, LOOP_JITTER_MS));
        continue;
      }
    }

    // Decide actual amount (clamp to caps & reserves)
    try {
      if (dir === "BUY") {
        // spend USDT
        const maxSpend = Math.min(usdtSpendAllowed, hourSpendRemaining);
        const amtUSDT = Math.min(notionalUsd, maxSpend);

        // tiny randomization to avoid “same-size” pattern
        const amtUSDTJ = Math.max(0.5, amtUSDT * rand(0.85, 1.15));

        const amountIn = parseUnits(amtUSDTJ.toFixed(18), DEC_USDT);
        await ensureApproval(USDT, ROUTER, amountIn);

        const slip = mode === "CORR" ? SLIPPAGE_PCT_CORR : SLIPPAGE_PCT_NORMAL;
        const res = await swapExact(amountIn, [USDT, USDDD], slip);

        spentUSDTThisHour += amtUSDTJ;

        console.log(`${mode} BUY  USDT→USDDD ${amtUSDTJ.toFixed(2)} tx:${res.hash}`);
      } else {
        // sell USDDD for USDT
        const amtUSDDD = (notionalUsd / clamp(price, 0.5, 2.0)) * rand(0.85, 1.15);
        const amtUSDDDClamped = Math.min(amtUSDDD, hourSellRemaining, bal.usddd);

        const amountIn = parseUnits(amtUSDDDClamped.toFixed(6), DEC_USDDD);
        await ensureApproval(USDDD, ROUTER, amountIn);

        const slip = mode === "CORR" ? SLIPPAGE_PCT_CORR : SLIPPAGE_PCT_NORMAL;
        const res = await swapExact(amountIn, [USDDD, USDT], slip);

        soldUSDDDThisHour += amtUSDDDClamped;

        console.log(`${mode} SELL USDDD→USDT ${amtUSDDDClamped.toFixed(6)} tx:${res.hash}`);
      }
    } catch (e) {
      const msg = String(e?.shortMessage || e?.message || e);
      if (isRateLimitError(e)) {
        console.log("⏳ TX FAIL (rate-limited): backing off...");
        await sleep(BACKOFF_BASE_MS);
      } else {
        console.log("TX FAIL:", msg.split("\n")[0]);
      }
    }

    // 10s reaction + jitter (harder to predict)
    await sleep(LOOP_BASE_MS + rand(0, LOOP_JITTER_MS));
  }

  console.log("✅ Bot stopped.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
