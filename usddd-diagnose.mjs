import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { bsc } from "viem/chains";

/**
 * ENV REQUIRED:
 *  - BSC_RPC_URL = your QuickNode HTTPS RPC
 *  - FROM_EOA    = the wallet that holds USDDD / tried to add liquidity
 */

const RPC = process.env.BSC_RPC_URL;
if (!RPC) {
  console.error("Missing BSC_RPC_URL env var");
  process.exit(1);
}

const FROM_EOA = process.env.FROM_EOA;
if (!FROM_EOA) {
  console.error("Missing FROM_EOA env var");
  process.exit(1);
}

const USDDD = getAddress("0x03f65216F340bAC39c8d1911288B1c7CA071e9c3");

// PancakeSwap (BSC)
const V2_ROUTER = getAddress("0x10ED43C718714eb63d5aA57B78B54704E256024E");
const V3_SWAP_ROUTER = getAddress("0x1b81D678ffb9C0263b24A97847620C99d213eB14");
const V3_POSITION_MANAGER = getAddress(
  "0x48dccD18803fC5168D9b87f6533cC055e3524952"
);

const ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const client = createPublicClient({
  chain: bsc,
  transport: http(RPC),
});

const FROM = getAddress(FROM_EOA);

async function simTransfer(to, label) {
  try {
    await client.simulateContract({
      address: USDDD,
      abi: ABI,
      functionName: "transfer",
      args: [to, 1n],
      account: FROM,
    });
    console.log("[OK] transfer() to " + label + " did NOT revert");
  } catch (e) {
    console.log("[REVERT] transfer() to " + label + " reverted");
    console.log(e.shortMessage || e.message || e);
  }
}

async function main() {
  const name = await client.readContract({
    address: USDDD,
    abi: ABI,
    functionName: "name",
  });
  const symbol = await client.readContract({
    address: USDDD,
    abi: ABI,
    functionName: "symbol",
  });
  const decimals = await client.readContract({
    address: USDDD,
    abi: ABI,
    functionName: "decimals",
  });

  console.log({
    token: USDDD,
    name,
    symbol,
    decimals: Number(decimals),
  });

  await simTransfer(V2_ROUTER, "Pancake V2 Router");
  await simTransfer(V3_SWAP_ROUTER, "Pancake V3 SwapRouter");
  await simTransfer(V3_POSITION_MANAGER, "Pancake V3 PositionManager");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
