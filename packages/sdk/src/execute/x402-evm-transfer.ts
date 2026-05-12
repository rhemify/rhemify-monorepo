import type { DetectionResult, ExecutionResult, PayOptions, WalletConfig } from "../types.js";
import { ExecutionError, NoWalletError } from "../errors.js";
import type { PaymentExecutor } from "./types.js";

/**
 * x402 ERC-20 USDC transfer executor for EVM chains.
 *
 * Mirror of x402SolanaTransferExecutor (phase R) for the EVM side. Real
 * settlement via ERC-20 `transfer(to, amount)`. Uses viem directly
 * instead of the x402-fetch peer-dep wrapper that the legacy
 * x402EvmExecutor relied on — same rationale as O.2's rewrite for
 * Solana: the upstream facilitator-style packages weren't proven
 * against any real endpoint we tested.
 *
 * Supported chains (where USDC has a canonical Circle deployment):
 *   - base            (Base mainnet)
 *   - base-sepolia    (Base testnet — what the test 402 server uses)
 *   - ethereum        (Ethereum mainnet)
 *   - ethereum-sepolia
 *
 * Cascade ordering: registered BEFORE x402EvmExecutor (the unproven
 * peer-dep variant). canExecute declines when payTo isn't a real
 * recipient (Base "0x0000…0001" placeholder the test server uses
 * by default), so a malformed-recipient endpoint falls through to
 * whatever's downstream (currently x402EvmExecutor which is also
 * declared optional).
 *
 * Wallet: the agent's EVM private key in `wallet.evmPrivateKey`. Same
 * shape as MetaMask / Phantom multi-chain export. Phantom is browser-
 * extension first so it isn't a programmatic signing surface for our
 * CLI/server agent flow — but a Phantom-exported private key, or any
 * 0x-prefixed 32-byte hex, plugs directly into this executor.
 */

const USDC_CONTRACTS: Record<string, `0x${string}`> = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "ethereum-sepolia": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

const RPC_URLS: Record<string, string> = {
  base: "https://mainnet.base.org",
  "base-sepolia": "https://sepolia.base.org",
  ethereum: "https://eth.llamarpc.com",
  "ethereum-sepolia": "https://sepolia.drpc.org",
};

// ERC-20 transfer ABI — minimal. Only the function we actually call.
const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

interface ViemAccount {
  address: `0x${string}`;
}

interface ViemPublicClient {
  waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
  }>;
}

interface ViemWalletClient {
  account: ViemAccount;
  writeContract(args: {
    address: `0x${string}`;
    abi: typeof ERC20_TRANSFER_ABI;
    functionName: "transfer";
    args: readonly [`0x${string}`, bigint];
  }): Promise<`0x${string}`>;
}

interface Viem {
  privateKeyToAccount(key: `0x${string}`): ViemAccount;
  createWalletClient(args: { account: ViemAccount; transport: unknown; chain: unknown }): ViemWalletClient;
  createPublicClient(args: { transport: unknown; chain: unknown }): ViemPublicClient;
  http(url: string): unknown;
}

interface ViemChains {
  base: unknown;
  baseSepolia: unknown;
  mainnet: unknown;
  sepolia: unknown;
}

export const x402EvmTransferExecutor: PaymentExecutor = {
  protocol: "x402",
  networks: ["base", "base-sepolia", "ethereum", "ethereum-sepolia"],

  canExecute(detection: DetectionResult, wallet: WalletConfig): boolean {
    if (detection.protocol !== "x402") return false;
    if (!isEvmNetwork(detection.network)) return false;
    if (!wallet.evmPrivateKey) return false;
    if (!isValidEvmRecipient(detection.payTo)) return false;
    return true;
  },

  async execute(
    url: string,
    detection: DetectionResult,
    wallet: WalletConfig,
    options: PayOptions,
  ): Promise<ExecutionResult> {
    if (!wallet.evmPrivateKey) {
      throw new NoWalletError("evm");
    }

    let viem: Viem;
    let chains: ViemChains;
    try {
      viem = (await import("viem")) as unknown as Viem;
      chains = (await import("viem/chains")) as unknown as ViemChains;
    } catch {
      throw new ExecutionError("viem is not installed. Run: bun add viem");
    }

    const usdcAddress = USDC_CONTRACTS[detection.network];
    const rpcUrl = RPC_URLS[detection.network];
    if (!usdcAddress || !rpcUrl) {
      throw new ExecutionError(
        `No USDC deployment / RPC configured for EVM network "${detection.network}"`,
      );
    }
    const chain = pickChain(chains, detection.network);

    // Normalize the hex key — accept both 0x-prefixed and raw 64-hex.
    const rawKey = wallet.evmPrivateKey.startsWith("0x")
      ? (wallet.evmPrivateKey as `0x${string}`)
      : (`0x${wallet.evmPrivateKey}` as `0x${string}`);

    const account = viem.privateKeyToAccount(rawKey);
    const walletClient = viem.createWalletClient({
      account,
      chain,
      transport: viem.http(rpcUrl),
    });
    const publicClient = viem.createPublicClient({ chain, transport: viem.http(rpcUrl) });

    const recipient = detection.payTo as `0x${string}`;
    const amountRaw = BigInt(detection.priceRaw); // detection emits base units (USDC has 6 decimals — same as Solana)

    let txHash: `0x${string}`;
    try {
      txHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [recipient, amountRaw],
      });
    } catch (err) {
      throw new ExecutionError(
        `ERC-20 transfer submit failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Wait for inclusion + revert check. EVM `transfer` returns bool; a
    // false return doesn't revert by default, but Circle's USDC reverts on
    // insufficient balance, so receipt.status === "success" is sufficient.
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") {
        throw new ExecutionError(`ERC-20 transfer reverted on-chain (tx ${txHash})`);
      }
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      throw new ExecutionError(
        `Failed to confirm tx ${txHash}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // x402-spec PaymentPayload — same shape as the Solana transfer
    // executor so a facilitator parser can route by network without
    // forking per protocol.
    const paymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: detection.network,
      payload: {
        transaction: txHash,
        kind: "erc20-transfer",
        token: usdcAddress,
        amount: detection.priceRaw,
        payer: account.address,
        recipient,
      },
    };
    const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload), "utf-8").toString("base64");

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          ...(options.headers ?? {}),
          "X-Payment": xPaymentHeader,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (err) {
      throw new ExecutionError(
        `Resource retry after ERC-20 transfer failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new ExecutionError(
        `Resource rejected paid request: ${response.status} ${response.statusText}. ` +
          `USDC transfer ${txHash} was already submitted on-chain — funds have moved.`,
        response.status,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("json") ? await response.json() : await response.text();

    const protocolReceipt =
      response.headers.get("payment-response") ??
      response.headers.get("x-payment-response") ??
      response.headers.get("x-payment-receipt") ??
      txHash;

    return {
      success: true,
      data,
      txHash,
      protocolReceipt,
      response,
    };
  },
};

function isEvmNetwork(network: string): boolean {
  return ["base", "base-sepolia", "ethereum", "ethereum-sepolia"].includes(network);
}

function isValidEvmRecipient(payTo: string): boolean {
  // 0x-prefixed 40-hex address. Reject the test-server placeholder
  // "0x0000…0001" so the cascade falls through instead of burning gas on
  // a known-bad recipient.
  if (!payTo || !payTo.startsWith("0x")) return false;
  if (payTo.length !== 42) return false;
  if (/^0x0+0*1$/i.test(payTo)) return false; // 0x...0001 placeholder
  if (/^0x0+$/i.test(payTo)) return false; // 0x...0 zero address
  return /^0x[0-9a-f]+$/i.test(payTo);
}

function pickChain(chains: ViemChains, network: string): unknown {
  switch (network) {
    case "base":
      return chains.base;
    case "base-sepolia":
      return chains.baseSepolia;
    case "ethereum":
      return chains.mainnet;
    case "ethereum-sepolia":
      return chains.sepolia;
    default:
      throw new ExecutionError(`Unsupported EVM network: ${network}`);
  }
}
