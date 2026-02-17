import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * CMC SRD Supply Endpoint (USDDD)
 *
 * LOCKED FACTS / POLICY
 * - USDDD is BEP-20 on BSC
 * - USDDD has 6 decimals
 * - Wallet classification is embedded (wallet book)
 * - "Controlled" wallets are all in WALLET_BOOK
 * - MM wallets are circulating (only Pancake V3 USDT/USDDD Wallet)
 *
 * Definitions:
 * - totalSupplyRaw = totalSupply()
 * - sumKnownRaw = Σ balanceOf(wallet_book)
 * - otherRaw = totalSupplyRaw - sumKnownRaw   (anything not in wallet book)
 * - mmRaw = Σ balanceOf(mm wallets within wallet book)
 * - circulatingRaw = otherRaw + mmRaw
 */

const USDDD_TOKEN = "0x03f65216F340bAC39c8d1911288B1c7CA071e9c3";
const DECIMALS = 6;

// ✅ Wallet Book (from: DIGDUG_USDDD Wallets & Contracts.xlsx)
const WALLET_BOOK = [
  {
    name: "Owner / Deployer Wallet",
    dept: "USDDD/DIGDUGDO",
    kind: "EOA - EVM",
    address: "0x0A3AF77Fa1bb5682797668bdAcE0E94F7041c72E",
    note: "Highest Operator Authority",
  },
  {
    name: "Manager Wallet",
    dept: "USDDD/DIGDUGDO",
    kind: "EOA - EVM",
    address: "0x9A1f50E93bF14538456664e83306f35f769C12B7",
    note: "Senior Operator Authority / Multi-Signer",
  },
  {
    name: "Main Contract",
    dept: "USDDD",
    kind: "Contract - BEP20",
    address: "0x03f65216F340bAC39c8d1911288B1c7CA071e9c3",
    note: "USDDD token contract",
  },
  {
    name: "Implementation",
    dept: "USDDD",
    kind: "Contract - BEP20",
    address: "0xA6e47a2Bc4D7371660124b56Fc1A042da41E6c12",
    note: "USDDD implementation contract",
  },
  {
    name: "ProxyAdmin (Upgrade Controller)",
    dept: "USDDD",
    kind: "Contract - BEP20",
    address: "0x035Fe89fB7cB7610a756F2D7fe5154Fca5B2Ed90",
    note: "Proxy admin",
  },
  {
    name: "AdminManager (Permissions)",
    dept: "USDDD",
    kind: "Contract - BEP20",
    address: "0x4ef2b77620EC6BDdA714be2Cbe4dF0D57c7bB16A",
    note: "Permissions manager",
  },
  {
    name: "USDDD Treasury Pipe",
    dept: "USDDD",
    kind: "EOA - EVM",
    address: "0x8304C9E29DDB3887E0ee5e1cB81b1AAb6B49B910",
    note: "Receive mint -> distribute to custody/hot/cold",
  },
  {
    name: "Treasury Cold Wallet",
    dept: "USDDD",
    kind: "EOA - EVM",
    address: "0xDD53367a567BF05F916515eDB5654E87E2b5F5eb",
    note: "USDDD reserves",
  },
  {
    name: "USDDD Hot Wallet",
    dept: "USDDD",
    kind: "EOA - EVM",
    address: "0xC5EF0b5BA7cB0d937A256806EA4438C9698fB863",
    note: "Operational hot wallet",
  },
  {
    name: "USDT Fund Network Pipe",
    dept: "USDDD",
    kind: "EOA - EVM",
    address: "0x55ea686DD14C78985FE1348F040FA68579dd1250",
    note: "Receive fund deposits -> move USDT out",
  },
  {
    name: "USDT Protocol Pipe",
    dept: "DIGDUGDO",
    kind: "EOA - EVM",
    address: "0x5Eb13B62b89153b8B89F681495Da37eA0044a46e",
    note: "Protocol USDT pipe",
  },
  {
    name: "Operations Hot Wallet",
    dept: "DIGDUGDO",
    kind: "EOA - EVM",
    address: "0x9E8eD2E154eC2C2C972033Fe3d09f7843797aB19",
    note: "All-token ops hot wallet",
  },
  {
    name: "Test Payer Funder 1",
    dept: "USDDD",
    kind: "EOA - EVM",
    address: "0x4B77E67a21Faec9eab8549822BE079CDc77FDEa5",
    note: "Test funder wallet",
  },
  {
    // ✅ Only MM wallet (counts as circulating even though DIGDUG-controlled)
    name: "Pancake V3 USDT/USDDD Wallet",
    dept: "USDDD",
    kind: "EOA - EVM",
    address: "0xf847Cfac029D8BBFF3Df537864d17a2a9A640436",
    note: "Pool management wallet",
    is_mm: true as const,
  },
  {
    name: "Golden Finds Payout Wallet",
    dept: "DIGDUGDO",
    kind: "EOA - EVM",
    address: "0x6F7D2bce74759333CFD8bcCD8480832aB96b2219",
    note: "Pre-Genesis golden finds payouts",
  },
] as const;

function env(name: string) {
  return process.env[name];
}

// --- Minimal ABI encoding (no deps) ---
const SEL_TOTAL_SUPPLY = "0x18160ddd"; // totalSupply()
const SEL_BALANCE_OF = "0x70a08231"; // balanceOf(address)

function pad32(hexNo0x: string) {
  return hexNo0x.padStart(64, "0");
}
function encBalanceOf(address: string) {
  const a = address.toLowerCase().replace(/^0x/, "");
  return SEL_BALANCE_OF + pad32(a);
}

async function ethCall(rpcUrl: string, to: string, data: string) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  };

  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result as string; // hex
}

function hexToBigInt(hex: string) {
  if (!hex || hex === "0x") return BigInt(0);
  return BigInt(hex);
}

function formatUnits6Trim(raw: bigint) {
  const ZERO = BigInt(0);
  const SCALE = BigInt(1_000_000);

  const sign = raw < ZERO ? "-" : "";
  const x = raw < ZERO ? -raw : raw;

  const whole = x / SCALE;
  const frac = x % SCALE;

  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return sign + whole.toString() + (fracStr ? "." + fracStr : "");
}

function jsonNoStore(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

export async function GET() {
  const rpcUrl = env("BSC_RPC_URL");

  if (!rpcUrl) {
    return jsonNoStore(
      {
        ok: false,
        error: "missing_env",
        message: "Set BSC_RPC_URL to enable on-chain reads.",
        token: "USDDD",
        chain: "BSC",
        contract: USDDD_TOKEN,
        decimals: DECIMALS,
      },
      500
    );
  }

  try {
    const totalHex = await ethCall(rpcUrl, USDDD_TOKEN, SEL_TOTAL_SUPPLY);
    const totalRaw = hexToBigInt(totalHex);

    // Fetch all balances in parallel
    const balances = await Promise.all(
      WALLET_BOOK.map(async (w) => {
        const balHex = await ethCall(rpcUrl, USDDD_TOKEN, encBalanceOf(w.address));
        const raw = hexToBigInt(balHex);
        return { address: w.address, raw };
      })
    );

    const balMap = new Map<string, bigint>();
    for (const b of balances) balMap.set(b.address.toLowerCase(), b.raw);

    let sumKnownRaw = BigInt(0);
    let sumMmRaw = BigInt(0);

    for (const w of WALLET_BOOK) {
      const raw = balMap.get(w.address.toLowerCase()) ?? BigInt(0);
      sumKnownRaw += raw;
      if ((w as any).is_mm) sumMmRaw += raw;
    }

    const otherRaw = totalRaw - sumKnownRaw;
    const circulatingRaw = otherRaw + sumMmRaw;

    const total = formatUnits6Trim(totalRaw);
    const circulating = formatUnits6Trim(circulatingRaw);

    return jsonNoStore({
      ok: true,

      token: "USDDD",
      chain: "BSC",
      contract: USDDD_TOKEN,
      decimals: DECIMALS,

      // Total supply (multiple aliases for indexers)
      total_supply_raw: totalRaw.toString(),
      total_supply: total,
      totalSupply: total,

      // Circulating supply (multiple aliases for indexers)
      circulating_supply_raw: circulatingRaw.toString(),
      circulating_supply: circulating,
      circulatingSupply: circulating,

      methodology: {
        version: "1",
        definition: "circulating = totalSupply − (all DIGDUG-controlled wallets except MM wallets)",
        mm_wallets: WALLET_BOOK.filter((w: any) => w.is_mm).map((w: any) => ({
          name: w.name,
          address: w.address,
        })),
        controlled_wallets_source: "Wallet book embedded in code (derived from DIGDUG_USDDD Wallets & Contracts.xlsx).",
        formula: "circulatingRaw = (totalRaw − sumKnownRaw) + sumMmRaw",
      },

      debug: {
        // helpful if CMC asks questions; safe to expose (no secrets)
        sum_known_raw: sumKnownRaw.toString(),
        sum_mm_raw: sumMmRaw.toString(),
        other_raw: otherRaw.toString(),
      },

      updated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return jsonNoStore(
      {
        ok: false,
        error: e?.message ?? "failed_to_query_chain",
        token: "USDDD",
        chain: "BSC",
        contract: USDDD_TOKEN,
      },
      500
    );
  }
}
