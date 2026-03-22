import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// --- config ---
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// --- validation ---
if (!RPC_URL) throw new Error("Missing RPC_URL");
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// normalize key
let pk = PRIVATE_KEY.trim();
if (!pk.startsWith("0x")) pk = "0x" + pk;

// --- setup ---
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(pk, provider);

// --- ABI ---
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)"
];

// --- address helpers ---
function normalizeAddress(value, label) {
  if (!value || typeof value !== "string") {
    throw new Error(`Missing or invalid ${label}`);
  }

  try {
    return ethers.getAddress(value.trim().toLowerCase());
  } catch {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

// --- 🔧 PUT YOUR TARGETS HERE ---
const approvals = [
  {
    token: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    spender: "0x1111111254eeb25477b68fb85ed929f73a960582"
  }
].map((item, index) => ({
  token: normalizeAddress(item.token, `approvals[${index}].token`),
  spender: normalizeAddress(item.spender, `approvals[${index}].spender`)
}));

// --- helper: delay ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- helper: format error ---
function formatError(err) {
  return err?.shortMessage || err?.reason || err?.message || String(err);
}

// --- revoke logic ---
async function revokeOne(token, spender) {
  const normalizedToken = normalizeAddress(token, "token");
  const normalizedSpender = normalizeAddress(spender, "spender");
  const normalizedOwner = normalizeAddress(wallet.address, "wallet.address");

  const contract = new ethers.Contract(normalizedToken, ERC20_ABI, wallet);

  let symbol = "UNKNOWN";
  try {
    symbol = await contract.symbol();
  } catch {}

  try {
    const current = await contract.allowance(normalizedOwner, normalizedSpender);
    console.log(`🔎 Current allowance: ${current.toString()}`);

    if (current === 0n) {
      console.log(`⏭️  Already revoked → ${symbol} (${normalizedToken})`);
      return;
    }

    console.log(`⚠️  Active approval found`);
  } catch (err) {
    console.log(`⚠️  Could not read allowance: ${formatError(err)}`);
    console.log(`⚠️  Continuing anyway`);
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}: ${symbol} (${normalizedToken})`);

      const gas = await contract.approve.estimateGas(normalizedSpender, 0n);
      const tx = await contract.approve(normalizedSpender, 0n, {
        gasLimit: gas
      });

      console.log(`📤 TX: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`✅ Confirmed block ${receipt.blockNumber}`);
      return;
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed: ${formatError(err)}`);

      if (attempt === 3) {
        console.error(`🚫 Giving up on ${symbol} (${normalizedToken})`);
        return;
      }

      await sleep(2000);
    }
  }
}

// --- main ---
async function main() {
  const network = await provider.getNetwork();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Wallet:", normalizeAddress(wallet.address, "wallet.address"));
  console.log("Network:", network.name, `(chainId: ${network.chainId.toString()})`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  for (const { token, spender } of approvals) {
    try {
      console.log(`\n🔧 Processing`);
      console.log(`Token:   ${token}`);
      console.log(`Spender: ${spender}`);

      await revokeOne(token, spender);
    } catch (err) {
      console.error("💥 Unexpected error:", formatError(err));
    }
  }

  console.log("\n🏁 ALL DONE");
}

main().catch((err) => {
  console.error("Fatal:", formatError(err));
  process.exitCode = 1;
});
